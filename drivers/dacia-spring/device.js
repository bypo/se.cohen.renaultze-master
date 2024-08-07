'use strict';

const Homey = require('homey');
const api = require('../../lib/api');

module.exports = class DaciaSpringDevice extends Homey.Device {

  async onInit() {
    this.log('Dacia Spring has been initialized for: ', this.getName());

    this.SetCapabilities();

    this.hvacState = 'off';
    this.setCapabilityValue('onoff', false);
    this.registerCapabilityListener('onoff', this.onCapabilityButton.bind(this));

    this.chargeStart = 'off';

    this.setCapabilityValue('charge_start', false);
    this.registerCapabilityListener('charge_start', this.onCapabilityChargeStartButton.bind(this));

    this.registerCapabilityListener('measure_totalMileage', this.onCapabilityChargeStartButton.bind(this));


    this.fetchData()
      .catch(err => {
        this.error(err);
      });

    this.pollingInterval = this.homey.setInterval(() => { this.fetchData(); }, 420000);
  }

  SetCapabilities() {

    if (this.hasCapability('charge_start') === false) {
      this.log('Added charge_start capabillity ');
      this.addCapability('charge_start');
    }
    if (this.hasCapability('measure_isHome') === false) {
      this.log('Added measure_isHome capabillity ');
      this.addCapability('measure_isHome');
    }
    if (this.hasCapability('measure_location') === false) {
      this.log('Added measure_location capabillity ');
      this.addCapability('measure_location');
    }
    if (this.hasCapability('measure_location_latitude') === false) {
      this.log('Added measure_location_latitude capabillity ');
      this.addCapability('measure_location_latitude');
    }
    if (this.hasCapability('measure_location_longitude') === false) {
      this.log('Added measure_location_longitude capabillity ');
      this.addCapability('measure_location_longitude');
    }
  }

  async setLocation(result) {
    this.log('-> setLocation run');
    try {
      let lat = result.data.attributes.gpsLatitude;
      let lng = result.data.attributes.gpsLongitude;
      const HomeyLat = this.homey.geolocation.getLatitude();
      const HomeyLng = this.homey.geolocation.getLongitude();
      const settings = this.getSettings();
      let renaultApi = new api.RenaultApi(settings);
      const setLocation = renaultApi.calculateHome(HomeyLat, HomeyLng, lat, lng);
      await this.setCapabilityValue('measure_isHome', setLocation <= 1);
      await this.setCapabilityValue('measure_location', 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng);
//      await this.setCapabilityValue('measure_location_latitude', lat.toString());
//      await this.setCapabilityValue('measure_location_longitude', lng.toString());
      await this.setCapabilityValue('measure_location_latitude', String(lat));
      await this.setCapabilityValue('measure_location_longitude', String(lng));
    } catch (error) {
      this.homey.app.log(error);
    }
  }

  async chargeStartActionRunListener(args, state) {
    this.log('-> chargeStartActionRunListener run');
    const settings = this.getSettings();
    let renaultApi = new api.RenaultApi(settings);
    renaultApi.chargingStart()
      .then(result => {
        this.log(result);
        this.setCapabilityValue('charge_start', true);
      });
  }


  async chargeStopActionRunListener(args, state) {
    this.log('-> chargeStopActionRunListener run');
    const settings = this.getSettings();
    let renaultApi = new api.RenaultApi(settings);
    renaultApi.chargingStop()
      .then(result => {
        this.log(result);
        this.setCapabilityValue('charge_start', false);
      });
  }

 async onCapabilityButton(opts) {
    this.log('-> onCapabilityButton is clicked');
    if (opts === true) {
      this.log('Start AC');
      let batterylevel = this.getCapabilityValue('measure_battery');
      if (batterylevel > 24) { // Zoe internal app can not run heater below 40 - we will be a bit nicer
        const settings = this.getSettings();
        let renaultApi = new api.RenaultApi(settings);
        renaultApi.startAC(21)
          .then(result => {
            this.log(result);
            this.setHvacStatus('on');
            this.data = this.homey.setTimeout(() => { this.setHvacStatus('off'); }, 600000);
          })
          .catch((error) => {
            this.log(error);
            this.setHvacStatus('off');
            throw new Error('An error occured when trying to start heater.', error);
          });
      }
      else {
        this.log('Battery level to low o start.');
        this.setHvacStatus('off');
        throw new Error('Your car need some more charging before using heater, not started 25% is needed).');
      }
    }
    else {
      this.log('Stop AC');
      this.setHvacStatus('on');
      throw new Error('There is no way to stop a stated heater session on current Dacia Spring implementation.');
    }
  }

  async onCapabilityChargeStartButton(opts) {
    this.log('-> onCapabilityChargeButton is clicked');
    if (opts === true) {
      this.log('Start Charging');
        const settings = this.getSettings();
        let renaultApi = new api.RenaultApi(settings);
        renaultApi.chargingStart()
          .then(result => {
            this.log(result);
            this.setChargeStatus('on');
            this.data = this.homey.setTimeout(() => { this.setChargeStatus('off'); }, 600000);
          })
          .catch((error) => {
            this.log(error);
            this.setChargeStatus('off');
            throw new Error('An error occured when trying to start charging.', error);
          });      
    }
    else {
      this.log('Stop Charging');
      const settings = this.getSettings();
      let renaultApi = new api.RenaultApi(settings);
      renaultApi.chargingStop()
        .then(result => {
          this.log(result);
          this.setChargeStatus('off');
          this.data = this.homey.setTimeout(() => { this.setChargeStatus('off'); }, 600000);
        })
        .catch((error) => {
          this.log(error);
          this.setChargeStatus('off');
          throw new Error('An error occured when trying to stop charging.', error);
        });      
    }
  }

  setHvacStatus(status) {
    this.log('-> setHvacStatus');
    this.log({ 'oldValue': this.hvacState, 'newValue': status })
    this.hvacState = status;
    if (status === 'on') {
      this.setCapabilityValue('onoff', true)
    }
    else {
      this.setCapabilityValue('onoff', false)
    }
  }


  setChargeStatus(status) {
    this.log('-> setChargeStatus');
    this.log({ 'oldValue': this.chargeStart, 'newValue': status })
    this.chargeStart = status;
    if (status === 'on') {
      this.setCapabilityValue('onoff', true)
    }
    else {
      this.setCapabilityValue('onoff', false)
    }
  }

  async fetchData() {
    this.log('-> enter fetchCarData');
    const settings = this.getSettings();
    this.log(settings);
    let renaultApi = new api.RenaultApi(settings);

    
      renaultApi.getBatteryStatus()
      .then(result => {
        this.log('-> enter getBatteryStatus');
        this.log(result.data);
        
        if (result.status == 'notSupported') {
          this.setCapabilityValue('measure_battery', 0);
          this.setCapabilityValue('measure_batteryTemperature', 0);
        //this.setCapabilityValue('measure_batteryAvailableEnergy', 0);
          this.setCapabilityValue('measure_batteryAutonomy', 0);
          this.setCapabilityValue('measure_plugStatus', false);
          this.setCapabilityValue('measure_chargingStatus', false);
          this.setCapabilityValue('measure_chargingRemainingTime', 0);
        //this.setCapabilityValue('measure_chargingInstantaneousPower', 0);
        }
        else {
          this.setCapabilityValue('measure_battery', result.data.data.attributes["batteryLevel"] ?? 0);
          this.setCapabilityValue('measure_batteryTemperature', result.data.data.attributes["batteryTemperature"] ?? 20);
          this.setCapabilityValue('measure_batteryAvailableEnergy', result.data.data.attributes["batteryAvailableEnergy"] ?? 0);
          this.setCapabilityValue('measure_batteryAutonomy', result.data.data.attributes["batteryAutonomy"] ?? 0);
          let plugStatus = false;
          if (result.data.data.attributes["plugStatus"] === 1) {
            plugStatus = true;
          }
          this.setCapabilityValue('measure_plugStatus', plugStatus);
          
          let chargingRemainingTime = 0;
          let chargingInstantaneousPower = 0;
          let chargingStatus = false;
          if (result.data.data.attributes["chargingStatus"] === 1) {
            chargingStatus = true;
            chargingRemainingTime = result.data.data.attributes["chargingRemainingTime"] ?? 0;
     /*       chargingInstantaneousPower = result.data.data.attributes["chargingInstantaneousPower"] ?? 0;
            if (renaultApi.reportsChargingPowerInWatts()) {
              chargingInstantaneousPower = chargingInstantaneousPower / 1000;
            }   */
          }
          this.setCapabilityValue('charge_start', chargingStatus);
          this.setCapabilityValue('measure_chargingRemainingTime', chargingRemainingTime);
        // this.setCapabilityValue('measure_chargingInstantaneousPower', chargingInstantaneousPower);
        }
     })
     .catch((error) => {
      this.log(error);
     })

    renaultApi.getCockpit()
      .then(result => {
        this.log('-> enter getCockpit');
        this.log(result.data);
        if (result.status == 'ok') {
          this.setCapabilityValue('measure_totalMileage', result.data.data.attributes["totalMileage"] ?? 0);
        if (renaultApi.supportFuelStatus() == true) {
          this.setCapabilityValue('measure_batteryAutonomy', result.data.data.attributes["fuelAutonomy"] ?? 0);
          }
        }
      })
    .catch((error) => {
      this.log(error);
    });         

    
    renaultApi.getACStatus()
      .then(result => {
        this.log(result);
        if (result.status == 'ok') {
          this.setHvacStatus(result.data.hvacStatus);
        }
      })
    .catch((error) => {
      this.log(error);
    });   

    renaultApi.getLocation()
      .then(result => {
      this.log(result);
      if (result.status == 'ok') {
        this.setLocation(result.data);
        }
      })
    .catch((error) => {
        this.log(error);
    });

  }

  async onAdded() {
    this.log('Dacia Spring has been added');
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Dacia Spring settings where changed');
  }

  async onRenamed(name) {
    this.log('Dacia Spring was renamed');
  }

  async onDeleted() {
    this.log('Dacia Spring has been deleted');
    clearInterval(this.pollingInterval);
  }
}