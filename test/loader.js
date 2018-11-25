'use strict';

const util = require('util');
const path = require('path');
const fs   = require('fs');
const db   = require('./../lib/db');

// config
const conf = require('./update_config');


const SQL = {
    MNP: {
        CREATE_TABLE_PROVIDERS: `
            CREATE TABLE IF NOT EXISTS mnp_providers (
                orgcode     varchar(50)       NOT NULL,
                mnc         varchar(2)        NOT NULL,
                regioncode  varchar(2)    DEFAULT NULL,
                orgname     varchar(255)  DEFAULT NULL,

                UNIQUE KEY mnp_providers (orgcode, mnc)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci
        `,
        CREATE_TABLE_REGIONS: `
            CREATE TABLE IF NOT EXISTS mnp_regions (
                code    varchar(2)   NOT NULL,
                region  varchar(50)  NOT NULL,

                UNIQUE KEY mnp_regions (code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci
        `,
        CREATE_TABLE_MNP: `
            CREATE TABLE IF NOT EXISTS mnp (
                number      varchar(10)      NOT NULL,
                ownerid     varchar(50)      NOT NULL,
                mnc         varchar(2)       NOT NULL,
                regioncode  varchar(2)   DEFAULT NULL,
                portdate    datetime         NOT NULL,
                donorid     varchar(50)  DEFAULT NULL,
                oldmnc      varchar(2)   DEFAULT NULL,

                UNIQUE KEY mnp (number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci
        `,
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
        CREATE_TABLE: `
            CREATE TABLE IF NOT EXISTS def (
                code      varchar(3)    NOT NULL,
                begin     varchar(7)    NOT NULL,
                end       varchar(7)    NOT NULL,
                provider  varchar(255)  NOT NULL,
                region    varchar(255)  NOT NULL,

                UNIQUE KEY def (code, begin, end)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci
        `,
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
        CREATE_TABLE: `
            CREATE TABLE IF NOT EXISTS country_codes (
                code      varchar(10)   NOT NULL,
                country   varchar(255)  NOT NULL,

                UNIQUE KEY country_codes_unique (code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci
        `,
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
 * Initialize library with database connection credentials.
 *
 * @param {!Object} options Database connection config as it described in
 *                          `mysql` docs.
 */
const init = async options => {
    try {
        const conn = await db.connect(options);

        await Promise.all([
            conn.query(SQL.MNP.CREATE_TABLE_PROVIDERS),
            conn.query(SQL.MNP.CREATE_TABLE_REGIONS),
            conn.query(SQL.MNP.CREATE_TABLE_MNP),
            conn.query(SQL.DEF.CREATE_TABLE),
            conn.query(SQL.COUNTRY_CODES.CREATE_TABLE),
        ]);

        conn.end();
    } catch (err) {
        throw err;
    }
};


/**
 * Load data from file into DB and remove file.
 * @param {object} conn MySQL connection object.
 * @param {string} sql SQL query string.
 * @param {string} filename Full path to file.
 * @return {object} Promise with no result in `then()`.
 */
const loadTable = (conn, sql, filename) => new Promise((resolve, reject) => {
    const access = util.promisify(fs.access);

    access(filename, fs.constants.R_OK)
        .then(() => {
            console.log(`Load "${filename}"...`);

            conn.query(sql, {filename})
                .then(resolve)
                .catch(reject);
        })
        .catch(err => {
            console.log(`ERROR! File "${filename}" not exists.`);
            resolve();
        });
});


/**
 * Update MNP base.
 * @param {object} conn Database connection object.
 */
const updateMNP = async conn => {
    await Promise.all([
        loadTable(conn, SQL.MNP.LOAD_REGIONS , path.join(conf.src.dir, conf.src.mnp_regions)),
        loadTable(conn, SQL.MNP.LOAD_PROVIDER, path.join(conf.src.dir, conf.src.operators)),
        loadTable(conn, SQL.MNP.LOAD_MNP     , path.join(conf.src.dir, conf.src.mnp)),
    ]);
};


/**
 * Update DEF base.
 * @param {object} conn Database connection object.
 */
const updateDEF = async conn => {
    await Promise.all([
        loadTable(conn, SQL.DEF.LOAD, path.join(conf.src.dir, conf.src.abc3)),
        loadTable(conn, SQL.DEF.LOAD, path.join(conf.src.dir, conf.src.abc4)),
        loadTable(conn, SQL.DEF.LOAD, path.join(conf.src.dir, conf.src.abc8)),
        loadTable(conn, SQL.DEF.LOAD, path.join(conf.src.dir, conf.src.def)),
    ]);
    await conn.query(SQL.DEF.REMOVE_BLANK);
};


/**
 * Update country codes base.
 * @param {object} conn Database connection object.
 */
const updateCountries = async conn => {
    await loadTable(conn, SQL.COUNTRY_CODES.LOAD, path.join(conf.src.dir, conf.src.country_codes));
};


/**
 * Update DB. Note that you need `regions.dump` and `codes.dump` in `var`
 * directory.
 * `regions.dump` contains russian regions numbers from MNP DB in the following
 * format (without title):
 * ```
 * 77,Москва
 * ```
 * Note that this region number does not coresponds to automobile region codes,
 * so you strongly need to grab them from MNP provider server.
 *
 * `codes.dump` contains country codes in the following format (without title):
 * ```
 * 7; Russia / Kazakhstan
 * 71; Kazakhstan
 * ```
 * You can take this codes from any source you want, i.e. parse Wikipedia website.
 *
 * @param {!Object} config Object to connect to SFTP with MNP data. Should
 *                         contain following fields: {
 *                             host,
 *                             port,
 *                             user,
 *                             password
 *                         }
 */
const update = async () => {
    const conn = await db.connect();

    await Promise.all([
        updateMNP(conn),
        updateDEF(conn),
        updateCountries(conn),
    ]);

    conn.end();
};


/**
 * Main routine.
 */
async function main() {
    console.log('Initialize connection...');
    await init(conf.db);

    console.log('Update DB...');
    await update();
}


// run
main()
    .then(() => console.log('Done'));
