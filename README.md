# Description

Library allows to extract formatted phone numbers from text, convert them to universal format (only digits with country code) from any other format, define country, city and provider.

It defines country by country codes file you can create yourself, i.e. by parsing Wikipedia. It defines provider using offline DEF-base grabed from https://www.rossvyaz.ru/opendata/ and offline MNP base from http://www.zniis.ru/bdpn/check (you can get it from server only if you have authorised access).

# Installation

```bash
npm install def-codes
```

# Usage

```JavaScript
'use strict';
const def = require('def-codes');

const test = async () => {
    // DB to store information about phone codes.
    await def.init({
        socketPath: '/run/mysqld/mysqld.sock',
        user      : 'xinit',
        password  : 'password',
        database  : 'xinit'
    });

    // international number
    await def.info(def.normalize('+7 920 065-46-89'));
    /*
        result:
        {
            "country_codes": {
                "code": "7",
                "country": "Russia / Kazakhstan"
            },
            "def": [
                {
                    "code": "920",
                    "begin": "0000000",
                    "end": "0799999",
                    "provider": "ПАО \"МегаФон\"",
                    "region": "Нижегородская обл."
                }
            ],
            "mnp": [
                {
                    "owner": "\"ВымпелКом\" ПАО",
                    "mnc": "99",
                    "region": "Нижегородская область",
                    "portdate": "2015-12-22T22:12:04.000Z",
                    "donor": "\"МегаФон\" ПАО",
                    "oldmnc": ""
                }
            ]
        }
    */

    // russian number without country code
    await def.info(def.normalize('920 065-46-89', true));
    /*
        result:
        {
            "country_codes": {
                "code": "7",
                "country": "Russia / Kazakhstan"
            },
            "def": [
                {
                    "code": "920",
                    "begin": "0000000",
                    "end": "0799999",
                    "provider": "ПАО \"МегаФон\"",
                    "region": "Нижегородская обл."
                }
            ],
            "mnp": [
                {
                    "owner": "\"ВымпелКом\" ПАО",
                    "mnc": "99",
                    "region": "Нижегородская область",
                    "portdate": "2015-12-22T22:12:04.000Z",
                    "donor": "\"МегаФон\" ПАО",
                    "oldmnc": ""
                }
            ]
        }
    */

    // compare result without knowledle that number belongs to Russia
    await def.info(def.normalize('920 065-46-89'));
    /*
        result:
        {
            "country_codes": {
                "code": "92",
                "country": "Pakistan"
            }
        }
    */
}

test();
```

# Documentation
- [init]      (#initoptions)
- [update]    (#updateconfig)
- [normalize] (#normalizenumberrussianfalse)
- [extract]   (#extractstroptions)
- [info]      (#infonumber)

## `init(options)`
Initialize library with database connection credentials. You can use `info()` only after initializing library.

### Parameters
**options** \
`Object`. Database connection config as it described in `mysql` module docs.

### Return
Promise with no parameters in `then()`.


## `update(config)`
Update DB. \
Note that you need `regions.dump` and `codes.dump` in `var` directory of your module root path to update MySQL database.

`regions.dump` contains russian regions numbers from MNP DB in the following format (without title):
```
77,Москва
```

Note that this region number does not coresponds to automobile region codes, so you strongly need to grab them from MNP provider server (I can't publish it as I don't have permissions to).

`codes.dump` contains country codes in the following format (without title):
```
7; Russia / Kazakhstan
71; Kazakhstan
```

You can take this codes from any source you want, i.e. parse Wikipedia website.

If you run your script for the first time then you need to update database using this function. After that you can update DB from time to time to keep DEF, ABC and MNP data up-to-date.

### Parameters
**config** \
`Object` to connect to SFTP-server with MNP data. Should contain following fields:
```JavaScript
{
    host,
    port,
    user,
    password
}
```

### Return
`Promise` with no parameters in `then()`.


## `normalize(number, russian = false)`
Get number in every format and return number with country code as the first digit (only for russian mobile and POTS numbers) without any additional symbols or delimiters.

### Parameters
**number** \
`string`. Phone number in every format.

**russian** \
`boolean`. Assume number without explicit country code (`+` or `00`) as possibly russian (replace intercity code `8` by country code `7` or prepend numbers without country or intercity code by `7`). Parameter will only affect numbers what _may_ be russian according russian numbering plan, so feel free to use even if you are not sure about input. \
Default `false`.

### Return
`string`. Phone number consisting from digits only.

### Example
Numbers converted in the following way:
```csv
number              , russian, return
'007-495-1234567'   , true   , '74951234567'
'+7 (123) 456-78-90', true   , '71234567890'
'+71234567890'      , true   , '71234567890'
'8-499-123-45-67'   , true   , '74991234567'
'8-800-123-45-67'   , true   , '78001234567'
'8-903-123-45-67'   , true   , '79031234567'
'8 495 123-45-67'   , true   , '74951234567'
'8 (495) 123-45-67' , true   , '74951234567'
'8(495)123-45-67'   , true   , '74951234567'
'(495)1234567'      , true   , '74951234567'
'7104951234567'     , false  , '7104951234567'
'+7-495-1234567'    , true   , '74951234567'
'(81235)5-6789'     , true   , '78123556789'
'+1.495-123 4567'   , false  , '14951234567'
'903-123-45-67'     , true   , '79031234567'
'9031234567'        , true   , '79031234567'
'79031234567'       , true   , '79031234567'
'(903)123-45-67'    , true   , '79031234567'
'8(903)1234567'     , true   , '79031234567'
'+7(903)123 4567'   , true   , '79031234567'
'+7(903)'           , true   , '7903'
'8(903)'            , true   , '7903'
'+8(903)'           , true   , '8903'
'008(903)'          , true   , '8903'
'903'               , true   , '7903'
'+903'              , true   , '903'
'00903'             , true   , '903'
'+7(903)'           , false  , '7903'
'8(903)'            , false  , '8903'
'903'               , false  , '903'
```


## `extract(str, options = {})`
Extract all phone numbers from string `str` in array. \
Phone numbers will be handled with `normalize()` function automatically so you don't need to do it manually after extract.

### Parameters
**str** \
`string`. Text to extract phone numbers from. Function is fast and nonblocking so string can be quite long and contain tens of thousands numbers.

**options** \
`Object`. Can contain following fields: \
```JavaScript
{
    russian   : false,
    min_length: 3
}
```
`russian` tells whether function need assume numbers as russian (see `[normalize](#normalizenumberrussianfalse)` docs)). Default `false`.

`min_length` is minimal length of digit sequense to assume it as phone number. Default `3`.

### Return
`Promise` with `then(numbers)` where `numbers` is array with extracted phone numbers.

## `info(number)`
Get all possible information about number. \
Information about DEF and MNP awailable only for russian numbers.

### Parameters
**number** \
`string`. Phone number with country code prevoiusly formatted with `[normalize](#normalizenumberrussianfalse)` function.

### Return
`Object` with information about number. Countains following fields:
```JavaScript
{
    country_codes: {code, country},
    def: [{code, begin, end, provider, region}],
    mnp: [{owner, mnc, region, portdate, donor, oldmnc}]
}


***

@license MIT \
@version 1.0.0 \
@author Alexander Zubakov <developer@xinit.ru>
