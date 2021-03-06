const choo = require('choo');
const html = require('choo/html');
const http = require('xhr');
const find = require('lodash/find');
const logger = require('loglevel');
const queryString = require('query-string');
const store = require('./utils/localstorage.js');
const scrollIntoView = require('scroll-into-view');

const app = choo();
const appURL = 'https://5calls.org';
// const appURL = 'http://localhost:8090';

// use localStorage directly to set this value *before* bootstrapping the app.
const debug = (localStorage['org.5calls.debug'] === 'true');

if (debug) {
  // we don't need loglevel's built-in persistence; we do it ourselves above ^
  logger.setLevel(logger.levels.TRACE, false);
}

// get the stored zip location
cachedAddress = '';
store.getAll('org.5calls.location', (location) => {
  if (location.length > 0) {
   cachedAddress = location[0]
  }
});

// get the stored geo location
cachedGeo = '';
store.getAll('org.5calls.geolocation', (geo) => {
  if (geo.length > 0) {
    logger.debug("geo get", geo[0]);
    cachedGeo = geo[0]
  }
});

let cachedFetchingLocation = (cachedGeo === '') ? true : false;

// get the stored geo location
cachedAllowBrowserGeo = true;
store.getAll('org.5calls.allow_geolocation', (allowGeo) => {
  if (allowGeo.length > 0) {
    logger.debug("allowGeo get", allowGeo[0]);
    cachedAllowBrowserGeo = allowGeo[0]
  }
});

let cachedLocationFetchType = (cachedAllowBrowserGeo) ? 'browserGeolocation' : 'ipAddress';

// get the time the geo was last fetched
cachedGeoTime = '';
store.getAll('org.5calls.geolocation_time', (geo) => {
  if (geo.length > 0) {
    logger.debug("geo time get", geo[0]);
    cachedGeoTime = geo[0]
  }
});

cachedCity = '';
store.getAll('org.5calls.geolocation_city', (city) => {
  if (city.length > 0) {
    logger.debug("city get", city[0]);
    cachedCity = city[0]
  }
});

cachedFetchingLocation  = (cachedCity !== '') ? true : cachedFetchingLocation;
cachedLocationFetchType = (cachedAddress !== '') ? 'address' : cachedLocationFetchType;

// get the stored completed issues
completedIssues = [];
store.getAll('org.5calls.completed', (completed) => {
  completedIssues = completed == null ? [] : completed;
});

app.model({
  state: {
    // remote data
    issues: [],
    totalCalls: 0,
    splitDistrict: false,

    // manual input address
    address: cachedAddress,

    // automatically geolocating
    geolocation: cachedGeo,
    geoCacheTime: cachedGeoTime,
    allowBrowserGeo: cachedAllowBrowserGeo,
    cachedCity: cachedCity,

    // view state
    // getInfo: false,
    // activeIssue: false,
    // completeIssue: false,
    askingLocation: false,
    fetchingLocation: cachedFetchingLocation,
    locationFetchType: cachedLocationFetchType,
    contactIndices: {},
    completedIssues: completedIssues,

    showFieldOfficeNumbers: false,

    debug: debug,
  },

  reducers: {
    receiveIssues: (state, data) => {
      response = JSON.parse(data)
      issues = response.issues //.filter((v) => { return v.contacts.length > 0 });
      contactIndices = {};
      issues.forEach(function(item, index) {
         contactIndices[item.id] = 0;
      });
      return { issues: issues, splitDistrict: response.splitDistrict, invalidAddress: response.invalidAddress, contactIndices: contactIndices }
    },
    receiveTotals: (state, data) => {
      totals = JSON.parse(data);
      return { totalCalls: totals.count }
    },
    receiveIPInfoLoc: (state, data) => {
      geo = data.loc
      city = data.city
      time = new Date().valueOf()
      store.replace("org.5calls.geolocation", 0, geo, () => {});
      store.replace("org.5calls.geolocation_city", 0, city, () => {});
      store.replace("org.5calls.geolocation_time", 0, time, () => {});
      return { geolocation: geo, cachedCity: city, geoCacheTime: time, fetchingLocation: false, askingLocation: false }
    },
    setContactIndices: (state, data) => {
      contactIndices = state.contactIndices;
      if (data.newIndex != 0) {
        contactIndices[data.issueid] = data.newIndex;
        return { contactIndices: contactIndices }
      } else {
        contactIndices[data.issueid] = 0;
        return { contactIndices: contactIndices, completedIssues: state.completedIssues.concat(data.issueid) }
      }
    },
    setAddress: (state, address) => {
      Raven.setExtraContext({ address: address })
      store.replace("org.5calls.location", 0, address, () => {});

      return { address: address, askingLocation: false }
    },
    setGeolocation: (state, data) => {
      store.replace("org.5calls.geolocation", 0, data, () => {});
      return { geolocation: data, fetchingLocation: false }
    },
    setCachedCity: (state, data) => {
      response = JSON.parse(data);
      if (response.normalizedLocation && state.cachedCity == '') {
        store.replace("org.5calls.geolocation_city", 0, response.normalizedLocation, () => {});
        return { cachedCity: response.normalizedLocation }
      } else {
        return null
      }
    },
    fetchingLocation: (state, data) => {
      return { fetchingLocation: data }
    },
    allowBrowserGeolocation: (state, data) => {
      store.replace("org.5calls.allow_geolocation", 0, data, () => {})
      return { allowBrowserGeo: data }
    },
    enterLocation: (state, data) => {
      return { askingLocation: true }
    },
    setLocationFetchType: (state, data) => {
      let askingLocation = (data === 'address');
      return { locationFetchType: data, askingLocation: askingLocation, fetchingLocation: !askingLocation }
    },
    resetLocation: (state, data) => {
      store.remove("org.5calls.location", () => {});
      store.remove("org.5calls.geolocation", () => {});
      store.remove("org.5calls.geolocation_city", () => {});
      store.remove("org.5calls.geolocation_time", () => {});
      return { address: '', geolocation: '', cachedCity: '', geoCacheTime: '' }
    },
    resetCompletedIssues: (state, data) => {
      store.remove("org.5calls.completed", () => {});
      return { completedIssues: [] }
    },
    home: (state, data) => {
      return { activeIssue: false, getInfo: false }
    },
    toggleFieldOfficeNumbers: (state, data) => ({ showFieldOfficeNumbers: !state.showFieldOfficeNumbers }),
    hideFieldOfficeNumbers: (state, data) => ({ showFieldOfficeNumbers: false }),
  },

  effects: {
    fetch: (state, data, send, done) => {
      address = "?address="
      if (state.address !== '') {
        address += state.address
      } else if (state.geolocation !== "") {
        address += state.geolocation
      }

      const issueURL = appURL+'/issues/'+address
      logger.debug("fetching url",issueURL);
      http(issueURL, (err, res, body) => {
        send('setCachedCity', body, done)
        send('receiveIssues', body, done)
      })
    },
    getTotals: (state, data, send, done) => {
      http(appURL+'/report/', (err, res, body) => {
        send('receiveTotals', body, done)
      })
    },
    setLocation: (state, data, send, done) => {
      send('setAddress', data, done);
      send('fetch', {}, done);
    },
    setBrowserGeolocation: (state, data, send, done) => {
      send('setGeolocation', data, done);
      send('fetch', {}, done);
    },
    unsetLocation: (state, data, send, done) => {
      send('resetLocation', data, done)
      send('startup', data, done)
    },
    fetchLocationBy: (state, data, send, done) => {
      send('setLocationFetchType', data, done)
      send('startup', data, done)
    },
    fetchLocationByIP: (state, data, send, done) => {
      http('https://ipinfo.io/json', (err, res, body) => {
        if (res.statusCode == 200) {
          try {
            response = JSON.parse(body)
            if (response.city != "") {
              send('receiveIPInfoLoc', response, done);
              send('fetch', {}, done);
            } else {
              send('fetchLocationBy', 'address', done);
              Raven.captureMessage("Location with no city: "+response.loc, { level: 'warning' });
            }
          } catch(e) {
            send('fetchLocationBy', 'address', done);
            Raven.setExtraContext({ json: data })
            Raven.captureMessage("Couldn’t parse ipinfo json", { level: 'error' });
          }

        } else {
          send('fetchLocationBy', 'address', done);
          Raven.captureMessage("Non-200 from ipinfo", { level: 'info' });
        }
      })
    },
    handleBrowserLocationError: (state, data, send, done) => {
      // data = error from navigator.geolocation.getCurrentPosition
      if (data.code === 1) {
        send('allowBrowserGeolocation', false, done);
      }
      if (state.geolocation == '') {
        send('fetchLocationBy', 'ipAddress', done);
      }
    },
    fetchLocationByBrowswer: (state, data, send, done) => {
      let geoSuccess = function(position) {
        window.clearTimeout(slowResponseTimeout);
        if (typeof position.coords !== 'undefined') {
          let lat = position.coords.latitude;
          let long = position.coords.longitude;

          if (lat && long) {
            let geo = Math.floor(lat*10000)/10000 + ',' + Math.floor(long*10000)/10000;
            send('allowBrowserGeolocation', true, done);
            send('setBrowserGeolocation', geo, done);
          } else {
            logger.warn("Error: bad browser location results");
            send('fetchLocationBy', 'ipAddress', done);
          }
        } else {
          logger.warn("Error: bad browser location results");
          send('fetchLocationBy', 'ipAddress', done);
        }
      }
      let geoError = function(error) {
        window.clearTimeout(slowResponseTimeout);

        // We need the most current state, so we need another effect call.
        send('handleBrowserLocationError', error, done)
        logger.warn("Error with browser location (code: " + error.code + ")");
      }
      let handleSlowResponse = function() {
        send('fetchLocationBy', 'ipAddress', done);
      }
      // If necessary, this prompts a permission dialog in the browser.
      navigator.geolocation.getCurrentPosition(geoSuccess, geoError);

      // Sometimes, the user ignores the prompt or the browser does not
      // provide a response when they do not permit browser location.
      // After 5s, try IP-based location, but let browser-based continue.
      let slowResponseTimeout = window.setTimeout(handleSlowResponse, 5000);
    },
    // If appropriate, focus and select the text for the location input element
    // in the issuesLocation component.
    focusLocation: (state, data, send, done) => {
      let addressElement = document.querySelector('#address')
      scrollIntoView(addressElement);
      addressElement.focus();
      // Clear previous address to show placeholder text to
      // reinforce entering a new one.
      addressElement.value = "";
    },
    startup: (state, data, send, done) => {
      // sometimes we trigger this again when reloading mainView, check for issues
      if (state.issues.length == 0 || state.geolocation == '') {
        // Check for browser support of geolocation
        if ((state.allowBrowserGeo !== false && navigator.geolocation) &&
          state.locationFetchType === 'browserGeolocation' && state.geolocation == '') {
          send('fetchLocationByBrowswer', {}, done);
        }
        else if (state.locationFetchType === 'ipAddress' && state.geolocation == '') {
          send('fetchLocationByIP', {}, done);
        }
        else if (state.address !== '' || state.geolocation !== '') {
          send('fetchingLocation', false, done);
          send('fetch', {}, done);
        }
      }
    },
    oldcall: (state, data, send, done) => {
      ga('send', 'event', 'issue_flow', 'old', 'old');
    },
    incrementContact: (state, data, send, done) => {
      const issue = find(state.issues, ['id', data.issueid]);

      currentIndex = state.contactIndices[issue.id];
      if (currentIndex < issue.contacts.length - 1) {
        scrollIntoView(document.querySelector('#contact'));
        send('setContactIndices', { newIndex: currentIndex + 1, issueid: issue.id }, done);
      } else {
        scrollIntoView(document.querySelector('#content'));
        store.add("org.5calls.completed", issue.id, () => {})
        send('location:set', "/#done/" + issue.id, done)
        send('setContactIndices', { newIndex: 0, issueid: issue.id }, done);
      }
    },
    callComplete: (state, data, send, done) => {
      send('hideFieldOfficeNumbers', data, done);

      if (data.result == 'unavailable') {
        ga('send', 'event', 'call_result', 'unavailable', 'unavailable');
      } else {
        ga('send', 'event', 'call_result', 'success', data.result);
      }

      const body = queryString.stringify({ location: state.zip, result: data.result, contactid: data.contactid, issueid: data.issueid })
      http.post(appURL+'/report', { body: body, headers: {"Content-Type": "application/x-www-form-urlencoded"} }, (err, res, body) => {
        // don’t really care about the result
      })
      send('incrementContact', data, done);
    },
    skipCall: (state, data, send, done) => {
      send('hideFieldOfficeNumbers', data, done);

      ga('send', 'event', 'call_result', 'skip', 'skip');

      send('incrementContact', data, done);
    },
    activateIssue: (state, data, send, done) => {
      send('hideFieldOfficeNumbers', data, done);

      ga('send', 'event', 'issue_flow', 'select', 'select');

      scrollIntoView(document.querySelector('#content'));

      // Use Choo's internal model to control Window.location. Fixes issue #161
      // For more information, see: https://github.com/yoshuawuyts/choo/blob/f84ec43fa58508cc20fe537d752a14901339f0cd/README.md#router
      // this strips the query string which breaks hashes, so temp workaround
      send('location:set', "/#issue/" + data.id, done)
      // location = location.origin + "#issue/" + data.id;
      // location.hash = "issue/" + data.id;
    }
  },
});

app.router({ default: '/' }, [
  ['/', require('./pages/mainView.js')],
  ['/issue', require('./pages/mainView.js'),
    [':issueid', require('./pages/mainView.js')]
  ],
  ['/done', require('./pages/doneView.js'),
    [':issueid', require('./pages/doneView.js')]
  ],
  ['/about', require('./pages/aboutView.js')],
]);

const tree = app.start();
const rootNode = document.getElementById('root');
document.body.replaceChild(tree, rootNode);
