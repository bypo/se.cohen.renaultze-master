'use strict';

const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
const crypto_algorithm = 'aes-256-ctr';
const Homey = require('homey');
const JwtCheck = require('jwt-check-expiration');

class RenaultApi {

    constructor(settings) {
        this.settings = settings;
        this.encryptionKey = Homey.env.ENCRYPTION_KEY;

        if (typeof configurations !== 'undefined' && this.settings.locale) {
            const lookupString = this.settings.locale.replace('-', '_');
            this.configuration = configurations.find(el => el.country_string === lookupString);
        }

        // Fallback safeguard if no configuration is found
        if (!this.configuration) {
            console.error(`[ERROR] No Renault API configuration found for locale: ${this.settings.locale}`);

            this.configuration = {
                "gigya_url": "https://accounts.eu1.gigya.com",
                "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
                "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
                "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
            };
        }
    }

    // ****************************************************************************
    // Public 
    // ****************************************************************************

    encrypt(text) {
        if (!this.encryptionKey || this.encryptionKey === "") {
            console.log('Encryption key not found!');
            return text;
        }
        let iv = crypto.randomBytes(16);
        let cipher = crypto.createCipheriv(crypto_algorithm, Buffer.from(this.encryptionKey), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
    }

    decrypt(encryptedJson) {
        if (!encryptedJson.iv) {
            return encryptedJson;
        }
        let iv = Buffer.from(encryptedJson.iv, 'hex');
        let encryptedText = Buffer.from(encryptedJson.encryptedData, 'hex');
        let decipher = crypto.createDecipheriv(crypto_algorithm, Buffer.from(this.encryptionKey), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    calculateHome(lat1, lon1, lat2, lon2) {
        console.log(lat1);
        console.log(lon1);
        console.log(lat2);
        console.log(lon2);
        let R = 6371; // km
        let dLat = this.toRad(lat2 - lat1);
        let dLon = this.toRad(lon2 - lon1);
        lat1 = this.toRad(lat1);
        lat2 = this.toRad(lat2);
        let a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2) *
            Math.cos(lat1) *
            Math.cos(lat2);
        let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        let d = R * c;
        return d.toFixed(1);
    };

    toRad($Value) {
        return ($Value * Math.PI) / 180;
    }

    reportsChargingPowerInWatts() {
        const modelCode = this.settings.modelCode;
        console.log('reportsChargingPowerInWatts: ' + modelCode);
        if (modelCode === 'X101VE') {
            return true;
        }
        return false;
    }

    supportLocation() {
        const modelCode = this.settings.modelCode;
        console.log('supportLocation: ' + modelCode);
        if (modelCode === 'X101VE') {
            return false;
        }
        return true;
    }

    supportCockpit() {
        const modelCode = this.settings.modelCode;
        console.log('supportCockpit: ' + modelCode);
        if (modelCode === 'X101VE') {
            return false;
        }
        return true;
    }

    supportHvacStatus() {
        const modelCode = this.settings.modelCode;
        console.log('supportHvacStatus: ' + modelCode);
        if (modelCode === 'XJA1VP') {
            return false;
        }
        return true;
    }

    supportChargeMode() {
        const modelCode = this.settings.modelCode;
        console.log('supportChargeMode: ' + modelCode);
        if (modelCode === 'XJA1VP' || modelCode === 'XBG1VE') {
            console.log('supportChargeMode: NOT SUPPORTED');
            return false;
        }
        return true;
    }

    supportBatteryStatus() {
        const modelCode = this.settings.modelCode;
        console.log('supportBatteryStatus: ' + modelCode);
        if (modelCode === 'XJA1VP') {
            return false;
        }
        return true;
    }

    supportFuelStatus() {
        const modelCode = this.settings.modelCode;
        console.log('supportFuelStatus: ' + modelCode);
        if (modelCode === 'XJA1VP') {
            return true;
        }
        return false;
    }

    async signUp() {

        /*
            {
                status: 'ok',
                data: {
                    country: 'SE',
                    locale: 'sv-SE',
                    accountId: '55cc7a4d-28a4-4a66-bda8-13e3c4727a88'
                }
            }
        */

        console.log('signUp() start');

        let login_token;
        let person_id;
        let id_token;

        return this._gigyaLogin()
            .then(res1 => {
                login_token = res1.login_token;
                console.log('login_token '+login_token);
                return this._gigyaGetAccountInfo(login_token);
            })
            .then(res2 => {
                person_id = res2.personId;
                console.log('personId '+person_id);
                return this._gigyaGetJWT(login_token);
            })
            .then(res3 => {
                id_token = res3.id_token
                console.log('id_token '+id_token);
                return this._kamereonGetPerson(id_token, person_id);
            });
    }

    async getDevices() {

        /* 
            { status: 'ok', data: [ { vin: 'VF1AG000166767500' } ] }
        */

        console.log('getDevices() start');
    

        return this._getIdToken()
            .then(res => {
                return this._kamereonGetVehicles(res);
            });
    }

    async getBatteryStatus() {

        /* 
            {
                status: 'ok',
                data: {
                    id: 'VF1AG000166767500',
                    timestamp: '2020-12-28T11:58:50Z',
                    batteryLevel: 61,
                    batteryTemperature: 20,
                    batteryAutonomy: 137,
                    batteryCapacity: 0,
                    batteryAvailableEnergy: 29,
                    plugStatus: 0,
                    chargingStatus: 0,
                    chargingRemainingTime: 30,
                    chargingInstantaneousPower: 0
                }
            }
        */

        console.log('getBatteryStatus() start');

        if (this.supportBatteryStatus() === false) {
            console.log('getBatteryStatus() - not supported');
            return ({ status: "notSupported", data: null });
        }
        return this._getIdToken()
            .then(res => {
                return this._kamereonGet(res, "battery-status", 2);
            });
    }

    async getCockpit() {

        /*
            {
                status: 'ok',
                data: {
                    id: 'VF1AG000166767500',
                    fuelAutonomy: 0,
                    fuelQuantity: 0,
                    totalMileage: 763.28
                }
            }
        */

        console.log('getCcockpit() start');

        if (this.supportCockpit() === false) {
            console.log('getCcockpit() - not supported');
            return ({ status: "notSupported", data: null });
        }
        return this._getIdToken()
            .then(res => {
                return this._kamereonGet(res, "cockpit", 1);
            });

    }

    async getACStatus() {
        /*
          return: AC object
        */

        console.log('getACStatus() start');

        if (this.supportHvacStatus() === false) {
            console.log('getACStatus() - not supported');
            return ({ status: "notSupported", data: null });
        }
        return this._getIdToken()
            .then(res => {
                return this._kamereonGet(res, "hvac-status", 1);
            });
    }


    async startAC(temp) {

        // return:  AC object

        console.log('startAC() start');
    
        let body = {
            "data": {
                "type": "HvacStart",
                "attributes": {
                    "action": "start",
                    "targetTemperature": temp
                }
            }
        };

        return this._getIdToken()
            .then(res => {
                return this._kamereonPost(res, "actions/hvac-start", body, 1);
            });
    }

    async stopAC() {

        // return:  AC object

        console.log('stopAC() start');

        let body = {
            "data": {
                "type": "HvacStart",
                "attributes": {
                    "action": "cancel"
                }
            }
        };

        return this._getIdToken()
            .then(res => {
                return this._kamereonPost(res, "actions/hvac-start", body, 1);
            });
    }





    async getLocation() {
        /*
        {
            "data": {
                "type": "Car",
                "id": "VF1AG000164767503",
                "attributes": {
                    "gpsLongitude": 18.46149,
                    "gpsLatitude": 59.3125725,
                    "gpsDirection": null,
                    "lastUpdateTime": "2022-11-12T14:47:32Z"
                }
            }
        }
        */

        console.log('getLocationt() start');

        if (this.supportLocation() === false) {
            console.log('getLocationt() - not supported');
            return ({ status: "notSupported", data: null });
        }
        return this._getIdToken()
            .then(res => {
                return this._kamereonGet(res, "location", 1);
            });
    }

    async chargingStart() {

        // return:  AC object
        console.log('chargingStart() start');

        let body = {
             "data": {
                "type": "ChargePauseResume",
                "attributes":{"action":"resume"}
             }
        }
        /*
        let body = {
            "data": {
                "type": "ChargingStart",
                "attributes": {"action": "start"}
             }
        }
        */
        return this._getIdToken()
            .then(res => {
               return this._kamereonPostCharge(res, "charge/pause-resume", body, 1);
            //   return this._kamereonPost(res, "charge/charging-start", body, 1);
            });
    }

    async chargingStop() {
        // return:  AC object
        console.log('chargingStop() start');

        let body = {
            "data": {
                "type": "ChargePauseResume",
                "attributes":{"action":"pause"}
             }
        };
        
/*
        let body = {
            "data": {
                "type": "ChargingStart",
                "attributes": {"action": "stop"}
            }
        }
        */ 
        return this._getIdToken()
            .then(res => {
                return this._kamereonPostCharge(res, "charge/pause-resume", body, 1);
            //  return this._kamereonPost(res, "charge/charging-stop", body, 1);
            });
    }


    async getChargeMode() {
        /*
          return: charge mode object
        */

        console.log('getChargeMode() start');

        if (this.supportChargeMode() === false) {
            console.log('getChargeMode() - not supported');
            return ({ status: "notSupported", data: null });
        }        
        return this._getIdToken()
            .then(res => {
                return this._kamereonGet(res, "charge-mode", 1);
            });
    }

    async setChargeMode(mode) {

        // return: charge mode  object

        console.log('setChargeMode()');

        let body = {
            "data": {
                "type": "ChargeMode",
                "attributes": {
                    "action": mode
                }
            }
        };

        return this._getIdToken()
            .then(res => {
                return this._kamereonPost(res, "actions/charge-mode", body, 1);
            });
    }

    // ****************************************************************************
    // Private global 
    // ****************************************************************************

    async _getIdToken() {

        // use to check and get id_token for normal use, if one is sent in just return it...

/* DISABILITATO PERCHE' Homey.env.TOKEN e' nullo quindi forzo il refresh
        let token = Homey.env.TOKEN
        let tokenExpired = JwtCheck.isJwtExpired(token)
        console.log('Token expired: ' + tokenExpired);

        if (tokenExpired) {
*/          console.log('Get new token');
            return this._gigyaLogin()
                .then(res1 => {
                    return this._gigyaGetJWT(res1.login_token);
                })
                .then(res2 => {
                    Homey.env.TOKEN = res2.id_token // save token to env. variable
                    return res2.id_token;
                });
//      }

        return token;
    }

    // ****************************************************************************
    // Private Gigya 
    // ****************************************************************************

    async _gigyaLogin() {

        // return: sessionInfo.cookieValue
        // use for:
        // gigya accounts.getAccountInfo
        // gigya accounts.getJWT

        return axios.post(
            this.configuration.gigya_url + '/accounts.login',
            querystring.stringify({ ApiKey: this.configuration.gigya_api_key, loginID: this.decrypt(this.settings.username), password: this.decrypt(this.settings.password) }))
            .then(response => {
                if (response.data.statusCode === 200) {
                    return ({ status: "ok", login_token: response.data.sessionInfo.cookieValue });
                }
                else {
                    throw (response.data.statusReason)
                };
            });
    }

    async _gigyaGetAccountInfo(login_token) {

        // return : data.personIds
        // use for:
        // kamereon persons

        return axios.get(
            this.configuration.gigya_url + '/accounts.getAccountInfo',
            { params: { ApiKey: this.configuration.gigya_api_key, login_token: login_token } })
            .then(response => {
                if (response.data.statusCode === 200) {
                    return ({ status: "ok", personId: response.data.data.personId });
                }
                else {
                    throw (response.data.statusReason);
                }
            });
    }

    async _gigyaGetJWT(login_token) {

        // return: id_token
        // use for:
        // all calls to kamereon, timeout 900

        return axios.post(
            this.configuration.gigya_url + '/accounts.getJWT',
            querystring.stringify({ ApiKey: this.configuration.gigya_api_key, login_token: login_token, fields: "data.personId,data.gigyaDataCenter", expiration: 900 }))
            .then(response => {
                if (response.data.statusCode === 200) {
                    return ({ status: "ok", id_token: response.data.id_token });
                }
                else {
                    throw (response.data.statusReason);
                }
            });
    }

    // ****************************************************************************
    // Private Kamereon 
    // ****************************************************************************

    async _kamereonGetPerson(id_token, person_id) {

        return axios.get(
            this.configuration.kamereon_url + '/commerce/v1/persons/' + person_id, {
            headers: {
                'x-gigya-id_token': id_token,
                'apikey': this.configuration.kamereon_api_key
            }
        })
            .then(response => {
                let f = response.data.accounts.find(function (account, index) {
                    if (account.accountType === 'MYRENAULT')
                        return true;
                    if (account.accountType === 'MYDACIA')
                        return true;
                });
                if (f === undefined) {
                   throw ("No account found");
                }
                let data = {
                    country: response.data.country,
                    locale: response.data.locale,
                    accountId: f.accountId,
                };
                return ({ status: "ok", data: data });
            });
    }

    async _kamereonGetVehicles(id_token) {
        console.log("kameronGetVehicles " + id_token);

        return axios.get(
            this.configuration.kamereon_url + '/commerce/v1/accounts/' + this.settings.accountId + "/vehicles?country=" + this.settings.country, {
            headers: {
                'x-gigya-id_token': id_token,
                'apikey': this.configuration.kamereon_api_key
            }
        })
            .then(response => {
                // vehicleDetails.model.code : "X102VE"
                let vins = response.data.vehicleLinks.map(item => {
                    return {
                        vin: item.vin,
                        modelCode: item.vehicleDetails.model.code,
                        brand: item.vehicleDetails.brand.label,
                        model: item.vehicleDetails.model.label
                    }
                });
                return ({ status: "ok", data: vins })
            });
    }

    async _kamereonGet(id_token, path, version) {

        console.log('_kamereonGet:' + path)

        return axios.get(
            this.configuration.kamereon_url + '/commerce/v1/accounts/' + this.settings.accountId + "/kamereon/kca/car-adapter/v" + version + "/cars/" + this.settings.vin + "/" + path + "?country=" + this.settings.country, {
            headers: {
                'x-gigya-id_token': id_token,
                'apikey': this.configuration.kamereon_api_key
            }
        })
            .then(response => {
                console.log(response.data);
                return ({ status: "ok", data: response.data });
            })
            .catch(err => {
                console.log(err);
            });
    }

    async _kamereonPost(id_token, path, data, version) {

        console.log('_kamereonPost:' + path)

        return axios.post(
            this.configuration.kamereon_url + '/commerce/v1/accounts/' + this.settings.accountId + "/kamereon/kca/car-adapter/v" + version + "/cars/" + this.settings.vin + "/" + path + "?country=" + this.settings.country,
            data, {
            headers: {
                'Content-type': 'application/vnd.api+json',
                'x-gigya-id_token': id_token,
                'apikey': this.configuration.kamereon_api_key
            }
        })
            .then(response => {
                return ({ status: "ok", data: response.data });
            })
            .catch(err => {
                console.log(err);
            });
    }


    async _kamereonPostCharge(id_token, path, data, version) {

        console.log('_kamereonPostCharge:' + path)

        return axios.post(
            this.configuration.kamereon_url + '/commerce/v1/accounts/' + this.settings.accountId + "/kamereon/kcm/v" + version + "/vehicles/" + this.settings.vin + "/" + path + "?country=" + this.settings.country,
            data, {
            headers: {
                'Content-type': 'application/vnd.api+json',
                'x-gigya-id_token': id_token,
                'apikey': this.configuration.kamereon_api_key
            }
        })
            .then(response => {
                return ({ status: "ok", data: response.data });
            })
            .catch(err => {
                console.log(err);
            });
    }

}

// ****************************************************************************
// Static stores
// ****************************************************************************

// https://renault-wrd-prod-1-euw1-myrapp-one.s3-eu-west-1.amazonaws.com/configuration/android/config_en_GB.json



const configurations = [{
    "country_id": 1,
    "country_string": "bg_BG",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 2,
    "country_string": "cs_CZ",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 3,
    "country_string": "da_DK",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 4,
    "country_string": "de_DE",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 5,
    "country_string": "de_AT",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 6,
    "country_string": "de_CH",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 7,
    "country_string": "en_GB",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 8,
    "country_string": "en_IE",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 9,
    "country_string": "es_ES",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 10,
    "country_string": "es_MX",
    "gigya_url": "https://accounts.us1.gigya.com",
    "gigya_api_key": "4_yTFqPSsGxVyRXPZUM7t1Iw",
    "kamereon_url": "https://api-wired-prod-1-usw2.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 11,
    "country_string": "fi_FI",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 12,
    "country_string": "fr_FR",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 13,
    "country_string": "fr_BE",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 14,
    "country_string": "fr_CH",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 15,
    "country_string": "fr_LU",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_zt44Wl_wT9mnqn-BHrR19PvXj3wYRPQKLcPbGWawlatFR837KdxSZZStbBTDaqnb",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 16,
    "country_string": "hr_HR",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 17,
    "country_string": "hu_HU",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 18,
    "country_string": "it_IT",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 19,
    "country_string": "it_CH",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 20,
    "country_string": "nl_NL",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 21,
    "country_string": "nl_BE",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 22,
    "country_string": "no_NO",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 23,
    "country_string": "pl_PL",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 24,
    "country_string": "pt_PT",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 25,
    "country_string": "ro_RO",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 26,
    "country_string": "ru_RU",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 27,
    "country_string": "sk_SK",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 28,
    "country_string": "sl_SI",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}, {
    "country_id": 29,
    "country_string": "sv_SE",
    "gigya_url": "https://accounts.eu1.gigya.com",
    "gigya_api_key": "3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
    "kamereon_url": "https://api-wired-prod-1-euw1.wrd-aws.com",
    "kamereon_api_key": "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J"
}
];

module.exports = { RenaultApi };