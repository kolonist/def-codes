'use strict';
const db  = require('./db');
const upd = require('./update');


/**
 * SQL requests.
 * @const {Object}
 */
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
        `
    },
    COUNTRY_CODES: {
        CREATE_TABLE: `
            CREATE TABLE IF NOT EXISTS country_codes (
                code      varchar(10)   NOT NULL,
                country   varchar(255)  NOT NULL,

                UNIQUE KEY country_codes_unique (code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci
        `
    },
    GET_INFO: {
        COUNTRY_CODES: `
            SELECT code, country
            FROM country_codes
            WHERE
                INSTR(:number, code) = 1
            ORDER BY LENGTH(code) DESC
            LIMIT 1
        `,
        DEF: `
            SELECT code, begin, end, provider, region
            FROM def
            WHERE
                (
                    LENGTH(:number) < 3
                    AND
                    code LIKE CONCAT(:number, '%')
                )
                OR
                (
                    LENGTH(:number) = 3
                    AND
                    code = :number
                )
                OR
                (
                    LENGTH(:number) > 3
                    AND
                    code = SUBSTR(:number, 1, 3)
                    AND
                    SUBSTR(:number, 4) >= SUBSTR(begin, 1, LENGTH(:number) - 3)
                    AND
                    SUBSTR(:number, 4) <= SUBSTR(end, 1, LENGTH(:number) - 3)
                )
        `,
        MNP: `
            SELECT
                prov_current.orgname AS owner,
                mnp.mnc              AS mnc,
                regions.region       AS region,
                mnp.portdate         AS portdate,
                prov_donor.orgname   AS donor,
                mnp.oldmnc           AS oldmnc
            FROM mnp
            LEFT JOIN mnp_providers AS prov_current
                ON mnp.ownerid = prov_current.orgcode AND mnp.mnc = prov_current.mnc

            LEFT JOIN (
                SELECT * FROM mnp_providers
                GROUP BY orgcode
            ) AS prov_donor
                ON mnp.donorid = prov_donor.orgcode

            LEFT JOIN mnp_regions AS regions
                ON mnp.regioncode = regions.code

            WHERE
                number = :number
        `
    }
};


/**
 * Regular expression for all possible phone number forms.
 * @const {RegExp}
 */
const RE_NUMBER = /\+?\d+(?:\d|[\-\.\(\) ](?=\d)|\)(?=[ -]\d)|[ -](?=\(\d))+/g;


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
            conn.query(SQL.COUNTRY_CODES.CREATE_TABLE)
        ]);

        conn.end();
    } catch (err) {
        throw err;
    }
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
const update = async config => {
    const conn = await db.connect();

    await Promise.all([
        upd.updateMNP(conn, config),
        upd.updateDEF(conn),
        upd.updateCountries(conn)
    ]);

    conn.end();
};


/**
 * Get number in every format and return number with country code as the first
 * digit (only for russian mobile and POTS numbers) without any additional
 * symbols or delimiters.
 * @param {!string} number Phone number in every format.
 * @param {boolean} [russian] Assume number without explicit country code (`+`
 *                            or `00`) as possibly russian (replace intercity
 *                            code `8` by country code `7` or prepend numbers
 *                            without country or intercity code by `7`).
 *                            Parameter will only affect numbers what _may_ be
 *                            russian according russian numbering plan.
 * @return {string} Phone number consisting from digits only.
 */
const normalize = (number, russian = false) => {
    // define if first digit is country code (by prefix `+` or `00`)
    const with_countrycode = /^(\+|00)/.test(number);

    // normalize
    let normalized = number
        .trim()

        // leave only digits
        .replace(/[^\d]/g, '')

        // remove `0` at the beginning
        .replace(/^0+/, '');

    if (normalized.length < 2) {
        return normalized;
    }

    // for russian alike numbers add country code `7`
    if (russian && !with_countrycode) {
        if (/^8[3489]/.test(normalized)) {
            normalized = '7' + normalized.substr(1);

        } else if (/^[3489]/.test(normalized)) {
            normalized = '7' + normalized;
        }
    }

    return normalized;
}


/**
 * Extract all phone numbers from string `str` in array. Phone numbers will be
 * handled with `normalize()` function.
 * @param {string} str Text to extract phone numbers from.
 * @param {Object} [options] Can contain following fields: {
 *                              {boolean} russian, // Assume numbers as russian
 *                                                 // (see `normalize()` docs)).
 *                              {number} min_length  // minimal length of digit
 *                                                   // sequense to assume it
 *                                                   // phone number
 *                           }
 * @return {Promise} `Promise.then(numbers)` where `numbers` is array with
 *                   extracted phone numbers.
 */
const extract = (str, options = {}) => {
    return new Promise(resolve => {
        const opts = Object.assign({min_len: 3, russian: false}, options);

        let numbers = new Set();

        const fn = re => {
            const match = re.exec(str);
            if (match) {
                const number = normalize(match[0], opts.russian);

                if (number.length >= opts.min_len) {
                    numbers.add(number);
                }

                setImmediate(fn, re);
            } else {
                resolve([...numbers]);
            }
        };

        setImmediate(fn, RE_NUMBER);
    });
};


/**
 * Get information about number.
 * Information about DEF and MNP awailable only for russian numbers.
 *
 * @param {string} number Phone number with country code formatted with
 *                        `normalize()` function.
 * @return {Promise} Object with information about number: {
 *                       country_codes: {code, country},
 *                       def: [{code, begin, end, provider, region}],
 *                       mnp: [{owner, mnc, region, portdate, donor, oldmnc}]
 *                   }
 */
const info = async number => {
    const conn = await db.connect();

    let result = await conn.query(SQL.GET_INFO.COUNTRY_CODES, {number});
    if (result.length > 0) {
        result = {country_codes: result[0]};

        // only for russian numbers
        if(/^7[3489]/.test(number)) {
            // remove country code
            const local = number.substr(1);

            const def = await conn.query(SQL.GET_INFO.DEF, {number: local});
            if (def.length > 0) {
                result.def = def;
            }

            // only for full length mobile numbers
            if (local.length === 10 && local[0] === '9') {
                const mnp = await conn.query(SQL.GET_INFO.MNP, {number: local});
                if (mnp.length > 0) {
                    result.mnp = mnp;
                }
            }
        }
    } else {
        result = null;
    }

    conn.end();

    return result;
};


exports.init      = init;
exports.update    = update;
exports.normalize = normalize;
exports.extract   = extract;
exports.info      = info;
