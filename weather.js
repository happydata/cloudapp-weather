// For more documentation visit https://github.com/happydata/nomie-docs/blob/master/cloud-apps.md
'use strict';
var http = require('http');

// Use Dynamo for a light user store.
// This is used to remember the last time we tracked the weather for this user.
const doc = require('dynamodb-doc');
const dynamo = new doc.DynamoDB();
var tableName = 'weather-app-users';


/**
 * Nomie Cloud App Join JSON
 * The JOIN Data is read by Nomie to show the user a preview of your app before they install.
 * For details on this configuration visit https://github.com/happydata/nomie-docs/blob/master/cloud-apps.md
 */
var join = {
	"id": "io.nomie.apps.weather",
	"name": "Weather Tracker",
	"img": "http://snap.icorbin.com/weather-tracking.svg",
	"summary": "Automatically Track the Temp",
	"uses": ["last-location", "api", "geo", "commands"],
	"color": "#4A90E2",
	"hostedBy": "Brandon Corbin",
	"join": "https://api.nomie.io/apps/weather",
	"more": "https://nomie.io",
	"collection": {
		"method": "automatic",
		"frequency": "1d",
		"url": "https://api.nomie.io/apps/weather",
		"amount": "1d"
	},
	"leave": "https://api.nomie.io/apps/weather/leave",
	"info": {
		"units": {
			"type": "select",
			"value": "fahrenheit",
			"options": [
				{
					label: "Fahrenheit",
					value: "fahrenheit"
				},
				{
					label: "Celcius",
					value: "celcius"
				},
			],
			label: "Unit of Measure"
		},
		"temptype": {
			"type": "select",
			"value": "temp-max",
			"options": [
				{
					label: "Today's High",
					value: "temp-max"
				},
				{
					label: "Current Temp",
					value: "temp"
				},
			],
			label: "Record"
		}
	},
	"slots": {
		"temp": {
			"label": "Temperature",
			"summary": null,
			"tracker": null,
			"required": true,
			"recommended": {
				"label": "Temp",
				"config": {
					"type": "numeric",
					"uom": "celsius",
					"math": "mean"
				},
				"color": '#4A90E2',
				"icon": "flaticon-thermometer21"
			}
		},
		"humidity": {
			"label": "Humidity",
			"tracker": null,
			"required": false,
			"recommended": {
				"_id": "humidity",
				"label": "Humidity",
				"icon": "weather-snow-cloud",
				"config": {
					"type": "numeric",
					"uom": null,
					"dynamicCharge": false,
					"chargeFunc": [],
					"min": 1,
					"max": 10,
					"math": "mean"
				},
				"charge": 0,
				"color": "#064070",
				"lid": "custom.00fvux",
			}
		}
	}
};


/**
 * General Lambda Handler
 * @param  {Object} event   Lambda Event
 * @param  {Object} context Lambda Context
 */
exports.handler = function(event, context) {

	let weatherKey = process.env.WEATHER_KEY;
	let cloudAppResponse = {
		html: 'Nothing Defined'
	};

	/**
	 * Kelvin Converter
	 * @param {Number} kelvin Temp
	 */
	let Kelvin = function(kelvin) {
		return {
			convert: function(format) {
				var self = this;
				if (format == "celcius") {
					return self.c;
				} else {
					return self.f;
				}
			},
			k: kelvin,
			c: (kelvin - 273.15).toFixed(2),
			f: ((((kelvin - 273.15) * 9) / 5) + 32).toFixed(2)
		}
	}

	/**
	 * Down and Dirty User Object with
	 * DynamoDB Storage
	 *
	 * Example: User.init('12345').then(function() {
	 * 						var name = User.get('name');
	 * 						User.set('age', 23);
	 * 						User.save().then(function() {
	 * 							// it's saved.
	 * 						});
	 * 					})
	 *
	 * @type {Object}
	 */
	let User = {
		_dirty: true,
		_data: {},
		_cloudAppId: null,
		_getTableParams: function(item) {
			return {
				TableName: 'weather-app-users',
				Item: item
			};
		},
		init: function(cloudAppId) {
			return new Promise(function(resolve, reject) {
				User._cloudAppId = cloudAppId;
				dynamo.getItem({
					TableName: 'weather-app-users',
					Key: {
						id: cloudAppId
					}
				}, function(err, userItem) {

					if (err) {
						reject(err);
					} else {
						User._data = userItem.Item || {};
						User._dirty = false;
						resolve(User);
					}
				});
			});
		},
		get: function(key) {
			return User._data[key] || null;
		},
		set: function(key, value) {
			User._data[key] = value;
			return User;
		},
		save: function() {
			return new Promise(function(resolve, reject) {
				User._data.id = User._cloudAppId; // in case it gets over written
				dynamo.putItem(User._getTableParams(User._data), function(err, success) {
					if (err) {
						reject(err);
					} else {
						resolve(User);
					}
				});
			});
		}
	}


	/**
	 * Get the Content of a URL
	 * @param  {string} url Url to capture
	 * @return {string}     [description]
	 * source: https://www.tomas-dvorak.cz/posts/nodejs-request-without-dependencies/
	 * Author : Tomas Dvorak
	 */
	let getContent = function(url) {
		// return new pending promise
		return new Promise((resolve, reject) => {
			// select http or https module, depending on reqested url
			const lib = url.startsWith('https') ? require('https') : require('http');
			const request = lib.get(url, (response) => {
				// handle http errors
				if (response.statusCode < 200 || response.statusCode > 299) {
					reject(new Error('Failed to load page, status code: ' + response.statusCode));
				}
				// temporary data holder
				const body = [];
				// on every content chunk, push it to the data array
				response.on('data', (chunk) => body.push(chunk));
				// we are done, resolve promise with those joined chunks
				response.on('end', () => resolve(body.join('')));
			});
			// handle connection errors of the request
			request.on('error', (err) => reject(err))
		})
	};

	/**
	 * Validate that the Data Submitted is what we expected
	 * @param  {object}  capturedData Event Body data
	 * @return {Boolean}              Is it valid or not
	 */
	let isValidLocation = function(capturedData) {
		capturedData = capturedData || {};
		if (capturedData.experiment.location) {
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Get the WEather
	 * @param  {array}   geo      Geo Location
	 * @param  {Function} callback Callback
	 */
	let getWeather = function(geo, callback) {
		geo = geo || [];
		if (geo.length == 2) {
			var url = "http://api.openweathermap.org/data/2.5/weather?lat=" + geo[0] + "&lon=" + geo[1] + "&appid=" + weatherKey;
			getContent(url).then(function(results) {
				callback(null, results)
			}).catch(function(err) {
				callback(err, null);
			});
		} else {
			callback({
				message: 'No location data available'
			}, null);
		}

	}

	let minutesDiff = function(startDate, endDate) {
		var diff = Math.abs(endDate.getTime() - startDate.getTime());
		return (diff / 60000);
	};

	/**
	 * Prepare General Response
	 * @param  {Object} payload Object to send back
	 * @param  {number} code    Optional success / error code
	 * @return {object}
	 */
	var getResponse = function(payload, code) {
		// var payload = {
		//     html : "<div>Hi there</div>"
		// }
		return {
			statusCode: code || 200,
			headers: {
				"Access-Control-Allow-Origin": "*"
			},
			body: JSON.stringify(payload)
		}
	}

	/********************************************************
	 *
	 *  DO THE PROCESSING!
	 *
	 ********************************************************/

	// If it's a GET REQUEST
	if (event.httpMethod == 'GET') {
		// Responde with just the Join JSON
		context.succeed(getResponse(join));

	} else {
		// It's a POST request
		// lets capture the data!
		// If we're here, then Nomie has either automatically sent us this data
		// or the user has manually triggered the app to run.
		// Have fun processing the data!
		//

		/**
		 * Captured Data will contain the data sent from Nomie.
		 * @type {Object}
		 */
		var captureData = JSON.parse(event.body);

		/**
		 * Let's make sure we know there location
		 */
		if (isValidLocation(captureData)) {

			/**
			 * Let's get the weather!
			 */
			getWeather(captureData.experiment.location, function(err, results) {
				if (!err) {

					var weatherData = JSON.parse(results);
					var kelvinTemp = 0;
					var localTemp = null;
					cloudAppResponse = {
						html: 'Nothing Defined'
					};

					// Set some defautls in case they don't exist
					// so we don't blow things up.
					captureData.experiment = captureData.experiment || {};
					captureData.experiment.info = captureData.experiment.info || {};
					captureData.experiment.info.temptype = captureData.experiment.info.temptype || {};
					captureData.experiment.info.units = captureData.experiment.info.units || {};
					captureData.experiment.slots['humidity'] = captureData.experiment.slots['humidity'] || {};
					captureData.experiment.slots['pressure'] = captureData.experiment.slots['pressure'] || {};
					captureData.experiment.info.units = captureData.experiment.info.units || {};
					captureData.experiment.info.units.value = captureData.experiment.info.units.value || "fahrenheit";

					/**
					 * Commands To Run is an array of Nomie Commands to run.
					 * Please pay attention to the usage of this feature, and
					 * ensure you don't add a bunch of stuff to a users nomie data.
					 *
					 * These commands are the same commands that can be passed to the
					 * Nomie API (using the GET method) learn more at:
					 *
					 *
					 * @type {Array}
					 */
					let CommandsToRun = [];

					// Convert prefered temp type from Kelvin
					var temps = {
						high: new Kelvin(weatherData.main.temp_max).convert(captureData.experiment.info.units.value),
						low: new Kelvin(weatherData.main.temp_min).convert(captureData.experiment.info.units.value),
						current: new Kelvin(weatherData.main.temp).convert(captureData.experiment.info.units.value)
					};

					var tempToRecord;
					if (captureData.experiment.info.temptype.value) {
						if (captureData.experiment.info.temptype.value == "temp-max") {
							tempToRecord = temps.high;
						} else {
							tempToRecord = temps.current;
						}
					} else {
						tempToRecord = temps.current
					}

					/**
					 * Setup the Commands to Run
					 */
					CommandsToRun.push('/action=track/label=' + captureData.experiment.slots['temp'].tracker.label + '/value=' + tempToRecord);
					if(captureData.experiment.slots['humidity'].tracker) {
						CommandsToRun.push('/action=track/label=' + captureData.experiment.slots['humidity'].tracker.label + '/value=' + weatherData.main.humidity);
					}
					if(captureData.experiment.slots['pressure'].tracker) {
						CommandsToRun.push('/action=track/label=' + captureData.experiment.slots['pressure'].tracker.label + '/value=' + weatherData.main.pressure);
					}

					/**
					 * See if a Weather Description exists
					 * @type {string}
					 */
					var description = null;
					if (weatherData.weather[0]) {
						description = weatherData.weather[0].main;
					}

					/**
					 * Create the HTML response Title
					 * @type {string}
					 */
					cloudAppResponse.title = weatherData.name + ' Weather';

					/**
					 * Setup the Response HTMl. How cool are template strings!?
					 * @type {string}
					 */
					cloudAppResponse.html = `
						 <div class="nui-list">
							<div class="padding-off">
									<div class="current-temp padding-lg bg-primary text-center text-bold text-white border-radius">
											<label class="margin-lg-top">Current Temp</label>
											<div class="text-xxl text-thin ">${temps.current}&deg;</div>
											<div class="text-sm text-thin text-white margin-lg-bottom">${description}</div>
									</div>
						 </div>
						 <div class="nui-item-divider">
							<label>Temps</label>
						 </div>
						 <div class="nui-item">
								 <div class="nui-item-content">
										 <label>Low</label>
								 </div>
								 <div class="nui-item-addon">
									${temps.low}&deg;
								 </div>
						 </div>
						 <div class="nui-item">
								 <div class="nui-item-content">
										 <label>High</label>
								 </div>
								 <div class="nui-item-addon">
									${temps.high}&deg;
								 </div>
						 </div>

						 <div class="nui-item-divider">
							<label></label>
						 </div>
							<div class="nui-item">
									<div class="nui-item-content">
											<label>Humidity
									</div>
									<div class="nui-item-addon">
									 ${weatherData.main.humidity}%
									</div>
							</div>
							<div class="nui-item">
									<div class="nui-item-content">
											<label>Pressure
									</div>
									<div class="nui-item-addon">
									 ${weatherData.main.pressure}
									</div>
							</div>

						 </div>
						 `;


						// // context.succeed(getResponse(cloudAppResponse));
						User.init(captureData.anonid).then(function() {
							// Assume we should do the push.
							var doPush = true;

							// Check to see the last time we saved the temp
							if (User._data.hasOwnProperty('last_push')) {
								var lastPush = new Date(User._data.last_push);
								var age = minutesDiff(lastPush, new Date());
								cloudAppResponse.age = age;
								doPush = (age > 10) ? true : false;
							}

							// If do push, then send the commands .
							// otherwise, ignore them .
							if (doPush === true) {
								User.set('last_push', new Date().toJSON())
									.save().then(function(results) {
										// Pass commands to execute since its been
										// more than 10 minutes or the user has never run
										// before.
										cloudAppResponse.commands = CommandsToRun; //CommandsToRun
										context.succeed(getResponse(cloudAppResponse));
								}).catch(function(err) {
									cloudAppResponse.err = err;
									cloudAppResponse.errMessage = "User Save Failure";
									context.succeed(getResponse(cloudAppResponse));
								});
							} else {
								// No need to push commands.
								// just display the html only.
								context.succeed(getResponse(cloudAppResponse));
							}

						}).catch(function(userInitErr) {
							cloudAppResponse.err = userInitErr;
							cloudAppResponse.errMessage = "User Initialzation Failure";
							context.succeed(getResponse(cloudAppResponse));
						});


				} else {
					cloudAppResponse.html = "Error happened " + err.message;
					cloudAppResponse.err = err;
					context.succeed(getResponse(cloudAppResponse));
				}
			})

		} else {
			cloudAppResponse = {};
			// If the user hasn't tracked with Nomie yet, then no location will be present.
			// Lets inform the user...
			var noLocationHTML = `
				<div class="nui-list">
						<div class="nui-item">
								<label>Current Location can't be found. Have you tracked recently?</label>
						</div>
				</div>
			 `;
			cloudAppResponse.html = noLocationHTML;
			context.succeed(getResponse(cloudAppResponse));
		}
	}

};
