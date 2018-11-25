'use strict';
const mysql = require('mysql');


/**
 * DB connection pool.
 * @var {object}
 */
let pool = null;


/**
 * Create database connection object. Feel free to create it multiple times
 * because it will be really created only once.
 * @param {object} config Config object for `mysql` Client.
 * @return {object} Promise.then(conn) where conn is Connection object.
 */
const connect = (config = null) => {
    return new Promise((resolve, reject) => {
        // create connection pool first
        if (!pool) {
            if (!config) {
                return void reject(new Error('No config provided'));
            }

            pool = mysql.createPool(config);
        }

        pool.getConnection((err, conn) => {
            if (err) {
                return void reject(err);
            }

            resolve(new Connection(conn));
        });
    });
};


/**
 * DB connection class.
 */
class Connection {
    /**
     * Create connection and initialize it.
     * @param {object} conn MySQL connection.
     */
    constructor(conn) {
        this._client = conn;

        // allow using `:param` in queries
        this._client.config.queryFormat = this.prepare;
    }


    /**
     * Disconnect DB and destroy singleton object (i.e. to use different config
     * in other connections).
     */
    end() {
        this._client.release();
    }


    /**
     * Execute SQL query.
     * @param {string} sql SQL query string.
     * @param {object} params Params object.
     * @return {object} Promise.then(`rows`) where `rows` is result array.
     */
    query(sql, params = null) {
        return new Promise((resolve, reject) => {
            this._client.query(sql, params, (err, rows, fields) => {
                this._ready = true;

                if (err) {
                    return void reject(err);
                }

                return void resolve(rows);
            });
        });
    }


    /**
     * Prepare and cache SQL request for faster processing.
     * @param {string} sql SQL request string.
     * @param {object} params Params object.
     * @return {function} Function(params) to use in query.
     */
    prepare(sql, params = null) {
        if (!params) {
            return sql;
        }

        // sql: `... field = :p ...`, match - `:p`, param - `p`
        return sql.replace(/\:(\w+)/g, (match, param) => {
            if (params.hasOwnProperty(param)) {
                return mysql.escape(params[param]);
            }

            return match;
        });
    }


    /**
     * Escape `value` to use in query.
     * @param {string} value String to escape.
     * @return {string} Escaped value.
     */
    escape(value) {
        return mysql.escape(value);
    }
}


exports.connect = connect;
