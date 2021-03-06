'use strict';
const path = require('path');
const fs   = require('fs');

const assert = require('assert');

// require lib
const def = require('./../lib/def');


describe('normalize number', function() {
    const numbers = [
        [''                  , ''             , true],
        [''                  , ''             , false],
        ['007-495-1234567'   , '74951234567'  , true],
        ['+7 (123) 456-78-90', '71234567890'  , true],
        ['+71234567890'      , '71234567890'  , true],
        ['8-499-123-45-67'   , '74991234567'  , true],
        ['8-800-123-45-67'   , '78001234567'  , true],
        ['8-903-123-45-67'   , '79031234567'  , true],
        ['8 495 123-45-67'   , '74951234567'  , true],
        ['8 (495) 123-45-67' , '74951234567'  , true],
        ['8(495)123-45-67'   , '74951234567'  , true],
        ['(495)1234567'      , '74951234567'  , true],
        ['7104951234567'     , '7104951234567', false],
        ['+7-495-1234567'    , '74951234567'  , true],
        ['(81235)5-6789'     , '78123556789'  , true],
        ['+1.495-123 4567'   , '14951234567'  , false],
        ['903-123-45-67'     , '79031234567'  , true],
        ['9031234567'        , '79031234567'  , true],
        ['79031234567'       , '79031234567'  , true],
        ['(903)123-45-67'    , '79031234567'  , true],
        ['8(903)1234567'     , '79031234567'  , true],
        ['+7(903)123 4567'   , '79031234567'  , true],
        ['+7(903)'           , '7903'         , true],
        ['8(903)'            , '7903'         , true],
        ['+8(903)'           , '8903'         , true],
        ['008(903)'          , '8903'         , true],
        ['903'               , '7903'         , true],
        ['+903'              , '903'          , true],
        ['00903'             , '903'          , true],
        ['+7(903)'           , '7903'         , false],
        ['8(903)'            , '8903'         , false],
        ['903'               , '903'          , false],
    ];

    it('should properly normalize numbers', function(done) {
        for (let v of numbers) {
            assert.equal(def.normalize(v[0], v[2]), v[1], v[0]);
        }

        done();
    });
});


describe('extract numbers', function() {
    const str = `
007-495-1234567
    +7 (123) 456-78-90
 +71234560790
   8-499-123-45-67
8-800-123-45-67  8-903-113-45-67
8 495 153-75-67  8 (495) 153-45-67
    8(495)123-88-67
(495)1208767, 7104951237507,
+7-495-1057567
(81235)5-6789
+1.495-123 4567,
903-123-45-67   9031234567
79031233707
(903)123-07-76
8(903)1230570 +7(903)710 0456
8(903)1230067   +7(903)173 4062
+7(903)
   8-800-555-35-35
8(903) +8(903)
008(903)  903
+903    00903 +7(903), 8(903), 903,
9097896313;Фамилия Имя Отчество;Город, п.Поселок;Улица  7-15;;;;Экстел
9097897300;Фамилия Имя Отчество;Калининградская обл, п.Поселок Поселок;Молодежная 21;;;;Экстел
9097896005;Фамилия Имя Отчествоч;Калининград;Улица Улица бульвар 15-46;;;;Экстел
9097896988;Фамилия Имя Отчество, Каушань;Фрунзе 28;;;;Экстел
9097896404;Фамилия Имя Отчество;Советск;Улица 1-7;;;;Экстел
9097895028;Фамилия Имя Отчество;Город;Улица 69-7;;;;Экстел;9097896229;Фамилия Имя Отчество;Советск;Бомжатская 3-4;;;;Экстел; 9097896563 ;Фамилия Имя Отчество;Калининградская обл, п.Поселочек;Улица  38;;;;Экстел 9022182043;Фамилия Имя Отчество;Калининградская обл.;г. Город в/ч 81348 г. Улица;;;;Экстел
9097895578;Фамилия Имя Отчество;Город;Горького 1-37;;;;Экстел 9097895061;Фамилия Имя Отчество;Советск;Сталина 29а-2;;;;Экстел 9097896516;Фамилия Имя Отчество;Калининградская обл, г.Город;Калининградское шоссе 16б-2;;;;Экстел
9097897005;Фамилия Имя Отчество;Улица;Поражения 65-74;;;;Экстел
17 г.
Разработка ресурса — Artsofte 8 (800) 100-40-66
Наши контакты +7 (499) 677-21-66Перезвонить на мой номер
Телефон: 8 (4012)58-58-58, 058
Количество отзывов: 1 ефон: 8 (4012) 56-30-30, 555-444
ефон: 8 (4012) 93-33-33, 93-03-03, 77-77-24
Телефон: 8 (4012)60-36-03, 8 (4012)60-26-02 , 8-911-463-63-01
Телефон: 8 (4012) 359-444, 99-99-44
Registrar Abuse Contact Phone: +1.2083895740
Номера телефонов: дежурный 8-(4570)-452-073, телефон «горячей линии» 8-(4582)-742-693. Номера телефонов: Отдел по обеспечению деятельности антитеррористической комиссии области; 8-(2497)-429-425, т/ф. 254-809, 964-815.
    `;

    it('should properly extract all numbers from string', async function() {
        const numbers = await def.extract(str, {russian: true, min_len: 5});

        assert.equal(numbers.length, 55);
    });

    it('should properly extract all numbers from very large file', async function() {
        this.timeout(60000);

        const str = fs.readFileSync(path.join(__dirname, 'phones.txt'), {encoding: 'utf8'});

        const numbers = await def.extract(str, {russian: true, min_len: 5});

        assert.equal(numbers.length, 50000);
    });
});


describe('init connection', function() {
    it('should properly init', async function() {
        this.timeout(10000);

        await def.init(
            require(path.join(__dirname, 'update_config.json'))
        );
    });
});


describe('update databases', function() {
    it('should update DB', async function() {
        this.timeout(1200000);

        return await def.update(require(
            path.join(__dirname, '..', 'var', 'credentials.json')
        ));
    });
});


describe('get information about number', function() {
    const numbers = [
        '79097875077',        '79114800117',        '79291660791',
        '79000000111',        '79000000060',        '74012603603',
        '74996772166',        '78001004066',        '79610366386',
        '74996'      ,        '780010'     ,        '7961036'    ,
        '79610367154',        '79610367174',        '79200654235',
        '79200654689',        '79200654553',        '79200654554',
        '79889918573',        '79889918877',        '79889918277',
        '7988991',            '7988'       ,        '79889'      ,
        '79889919256',        '79889920001',        '79610135383',
        '79610135709',        '74957833783',        '12083895740',
        '79610135'   ,        '7495783378' ,        '12083'      ,
        '18159814410',        '442070159370',       '61282133006',
        '12464506547',        '045454545645',       '78945056554',
        '72454604655',        '7',                  '73',
    ];

    it('should get info', async function() {
        this.timeout(60000);

        for (const number of numbers) {
            const info = await def.info(number);
        }
    });
});
