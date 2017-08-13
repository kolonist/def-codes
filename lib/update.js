'use strict';
const util    = require('util');
const fs      = require('fs');
const path    = require('path');
const ssh2    = require('ssh2');
const jszip   = require('jszip');
const request = require('request');


/**
 * Directories to fetch MNP from.
 */
const REMOTE_MNP_DIR  = '/numlex/Port_All_Full';
const REMOTE_PROV_DIR = '/numlex/Operators';

/**
 * Filename of text file with MNP region codes.
 */
const LOCAL_MNP_REGIONS = path.resolve(__dirname, '..', 'var', 'regions.dump');

/**
 * URLs with ABC and DEF information files.
 */
const URL_ABC3 = 'https://www.rossvyaz.ru/opendata/7710549038-Rosnumbase/Kody_ABC-3kh.csv';
const URL_ABC4 = 'https://www.rossvyaz.ru/opendata/7710549038-Rosnumbase/Kody_ABC-4kh.csv';
const URL_ABC8 = 'https://www.rossvyaz.ru/opendata/7710549038-Rosnumbase/Kody_ABC-8kh.csv';
const URL_DEF  = 'https://www.rossvyaz.ru/opendata/7710549038-Rosnumbase/Kody_DEF-9kh.csv';

/**
 * Filename of text file with country calling codes.
 */
const LOCAL_COUNTRY_CODES = path.resolve(__dirname, '..', 'var', 'codes.dump');


const SQL = {
    MNP: {
        LOAD_MNP: `
            LOAD DATA LOCAL INFILE :filename
            REPLACE
            INTO TABLE mnp
            FIELDS TERMINATED BY ','
            IGNORE 1 LINES
            (number, ownerid, mnc, @dummy, regioncode, portdate, @dummy, @dummy, donorid, @dummy, @dummy, oldmnc);
        `,
        LOAD_PROVIDER: `
            LOAD DATA LOCAL INFILE :filename
            REPLACE
            INTO TABLE mnp_providers
            FIELDS TERMINATED BY ','
            IGNORE 1 LINES
            (orgcode, mnc, regioncode, orgname);
        `,
        LOAD_REGIONS: `
            LOAD DATA LOCAL INFILE :filename
            REPLACE
            INTO TABLE mnp_regions
            FIELDS TERMINATED BY ','
            (code, region);
        `
    },
    DEF: {
        LOAD: `
            LOAD DATA LOCAL INFILE :filename
            REPLACE
            INTO TABLE def
            CHARACTER SET 'cp1251'
            FIELDS TERMINATED BY ';'
            IGNORE 1 LINES
            (code, @begin, @end, @dummy, @provider, @region)
            SET
                begin    = TRIM(BOTH '\t' FROM @begin),
                end      = TRIM(BOTH '\t' FROM @end),
                provider = TRIM(BOTH '\t' FROM @provider),
                region   = REPLACE(TRIM(BOTH '\t' FROM @region), '|', ', ');
        `,
        REMOVE_BLANK: `
            DELETE FROM def WHERE begin = '';
        `
    },
    COUNTRY_CODES: {
        LOAD: `
            LOAD DATA LOCAL INFILE :filename
            REPLACE
            INTO TABLE country_codes
            FIELDS TERMINATED BY ';'
            (code, @country)
            SET country = TRIM(LEADING FROM @country);
        `
    }
};


/**
 * Download all data from readable stream into one buffer.
 * @param {stream.Readable} readable Stream to read data from.
 * @return {Promise} Promise returns buffer with data from `readable`.
 */
const downloadStream = readable => new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);

    readable
    .on('data', chunk => buf = Buffer.concat([buf, chunk]))
    .on('error', reject)
    .on('end', () => resolve(buf));
});


/**
 * Download last file by creation time from SFTP server from provided directory.
 * @param {object} config Object to connect SFTP with MNP data. Should contain
 *                        following fields: {
 *                              host
 *                            , port
 *                            , username
 *                            , password
 *                        }
 * @param {string} dir Directory to download file from.
 * @return {Promise} Returns downloaded buffer.
 */
const downloadSFTP = (config, dir) => {
    return new Promise((resolve, reject) => {
        const {host, port, user, password} = config;

        const ssh = new ssh2.Client();
        ssh.on('ready', () => {
            ssh.sftp((err, sftp) => {
                if (err) {
                    return void reject(err);
                }

                // get files list
                sftp.readdir(dir, (err, list) => {
                    if (err) {
                        return void reject(err);
                    }

                    // sort list by creation time
                    const filename = list.sort(
                        (e1, e2) => e1.attrs.mtime > e2.attrs.mtime ? 1 : -1
                    )

                    // get the most recent element
                    .slice(-1)[0]

                    // get filename
                    .filename;

                    // download file
                    const remotepath = path.join(dir, filename);

                    downloadStream(sftp.createReadStream(remotepath))
                    .then(buf => {
                        ssh.end();
                        resolve(buf);
                    })
                    .catch(reject);
                });
            });
        })
        .connect({host, port, user, password});
    });
};


/**
 * Download last by creation time zipped CSV file from SFTP server, unzip it and
 * save to `tmp` directory.
 * @param {object} config Object to connect SFTP with MNP data. Should contain
 *                        following fields: {
 *                              host
 *                            , port
 *                            , username
 *                            , password
 *                        }
 * @param {string} dir Directory to download most recent file from.
 * @return {object} Promise.then(filename).
 */
const downloadFileFromSFTP = (config, dir) => {
    return new Promise((resolve, reject) => {
        downloadSFTP(config, dir)

        // unzip all (there should be obly one file)
        .then(jszip.loadAsync)
        .then(zip => {
            zip.forEach((name, file) => {
                const localfile = path.resolve(__dirname, '..', 'tmp', name);

                file.nodeStream()
                .pipe(fs.createWriteStream(localfile))
                .on('error', reject)
                .on('finish', () => resolve(localfile));
            });
        })
        .catch(reject);
    });
};


/**
 * Download file from `url` and save it to `tmp` directory.
 * @param {string} url URL to download.
 * @return {object} Promise.then(filename).
 */
const downloadFileFromHTTP = url => new Promise((resolve, reject) => {
    const localfile = path.resolve(
        __dirname, '..', 'tmp', url.split('/').slice(-1)[0]
    );

    request(url)
    .on('error', reject)
    .on('end', () => resolve(localfile))
    .pipe(fs.createWriteStream(localfile));
});


/**
 * Copy file from local filesystem path to temp directory.
 * @param {string} filename Full local filesystem name of file to get.
 * @return {object} Promise.then(filename).
 */
const copyFile = filename => new Promise((resolve, reject) => {
    const localfile = path.resolve(
        __dirname, '..', 'tmp', path.basename(filename)
    );

    fs.createReadStream(filename)
    .on('error', reject)
    .pipe(
        fs.createWriteStream(localfile)
        .on('error', reject)
        .on('close', () => resolve(localfile))
    );
});


/**
 * Load data from file into DB and remove file.
 * @param {object} conn MySQL connection object.
 * @param {string} sql SQL query string.
 * @param {string} filename Full path to file.
 * @return {object} Promise with no result in `then()`.
 */
const loadTable = (conn, sql, filename) => new Promise((resolve, reject) => {
    const unlink = util.promisify(fs.unlink);

    conn.query(sql, {filename})
    .then(() => unlink(filename))
    .then(resolve)
    .catch(reject);
});


/**
 * Update MNP base.
 * @param {object} conn Database connection object.
 * @param {object} config Object to connect SFTP with MNP data. Should contain
 *                        following fields: {
 *                              host
 *                            , port
 *                            , user
 *                            , password
 *                        }
 * @return {object} Promise.
 */
const updateMNP = async (conn, config) => {
    const {host, port, user, password} = config;

    await Promise.all([
        loadTable(conn, SQL.MNP.LOAD_REGIONS,  await copyFile(LOCAL_MNP_REGIONS)),
        loadTable(conn, SQL.MNP.LOAD_PROVIDER, await downloadFileFromSFTP(config, REMOTE_PROV_DIR)),
        loadTable(conn, SQL.MNP.LOAD_MNP     , await downloadFileFromSFTP(config, REMOTE_MNP_DIR)),
    ]);
};


/**
 * Update DEF base.
 * @param {object} conn Database connection object.
 * @return {object} Promise.
 */
const updateDEF = async conn => {
    await Promise.all([
        loadTable(conn, SQL.DEF.LOAD, await downloadFileFromHTTP(URL_ABC3)),
        loadTable(conn, SQL.DEF.LOAD, await downloadFileFromHTTP(URL_ABC4)),
        loadTable(conn, SQL.DEF.LOAD, await downloadFileFromHTTP(URL_ABC8)),
        loadTable(conn, SQL.DEF.LOAD, await downloadFileFromHTTP(URL_DEF)),
    ]);
    await conn.query(SQL.DEF.REMOVE_BLANK);
};


/**
 * Update country codes base.
 * @param {object} conn Database connection object.
 * @return {object} Promise.
 */
const updateCountries = async conn => {
    await loadTable(conn, SQL.COUNTRY_CODES.LOAD, await copyFile(LOCAL_COUNTRY_CODES));
};


exports.updateMNP       = updateMNP;
exports.updateDEF       = updateDEF;
exports.updateCountries = updateCountries;
