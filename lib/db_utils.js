'use strict';


/**
 * Run SQL string.
 * @param {object} db Sqlite3 database connection.
 * @param {string} sql SQL request string.
 * @param {object} params Key-value object with parameters.
 * @return {Promise}
 */
const runSQL = (db, sql, params = {}) => new Promise((resolve, reject) => {
    db.run(sql, params, err => {
        if (err !== null)
            return void reject(err);
        else
            return void resolve();
    });
});


/**
 * Execute all SQL requests in `sql` string.
 * @param {object} db Sqlite3 database connection.
 * @param {string} sql SQL request string.
 * @return {Promise}
 */
const execSQL = (db, sql) => new Promise((resolve, reject) => {
    db.exec(sql, err => {
        if (err !== null)
            return void reject(err);
        else
            return void resolve();
    });
});


exports.runSQL  = runSQL;
exports.execSQL = execSQL;
