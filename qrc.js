var net = require('net');
var bluebird = require('bluebird');

var client = new net.Socket();
var client_connected = false;

var messageIndex = 0;
var responseQueue = {};

// Handle server responses
client.on('data', function(data) {
  
  // Parse
  data = data.toString().slice(0, -1); // remove null
  data = JSON.parse(data); // parse JSON

  // Check ID exists
  if(!data.id) { console.error('No ID present on JSONRPC message!', data); return; }

  // Get callback
  var cb = responseQueue[data.id];
  if(!cb) { console.error('No callback for received message!', data); return; }

  if(data.result) {
    cb(data.result, null); // call with no error
  } else if(data.error) {
    cb(null, data.error)
  } else {
    cb(null, {
      code: -1,
      message: 'Invalid response from server.'
    });
  }

});

client.on('close', function() {
  console.log('Connection closed');
  client_connected = false;
});

function call(method, params) {

  return new Promise(function(resolve, reject) {

    if(!client_connected) {
      reject('Socket not connected.');
    }

    // Generate unique message ID
    messageIndex++;

    // Set up response handler
    responseQueue[messageIndex] = function(r,e) {

      // Reject if error
      if(e) { reject(e); }

      // Else resolve
      resolve(r);

    };

    // Compile JSON
    var json = JSON.stringify({
      "jsonrpc": "2.0",
      "method": method,
      "params": params,
      "id": messageIndex
    });

    console.log(json);

    // Send request
    client.write(json+'\0');

  });

}

module.exports = {

  'Connect': function(ip) {
    return new Promise(function(resolve, reject) {
      client.connect(1710, ip, function() {

        // TODO: Check authentication before resolving

        client_connected = true;
        resolve();
      });
      client.on('error', reject);
    });
  },

  'NoOp': function() { return call('NoOp', {}); },
  'StatusGet': function() { return call('StatusGet', {}); },
  'Logon': function(u,p) { return call('Logon', { 'User': u, 'Password': p }); },
  'Control': {
    'Set': function(name, value, ramp) {
      var ctl = {'Name': name, 'Value': value};
      if(ramp) { ctl['Ramp'] = ramp; }
      return call('Control.Set', ctl);
    },
    'Get': function(names) {
      if(typeof names != 'Array') { names = [names]; } // handle single-item requests
      return call('Control.Get', names).then(function(r) {
        var controls = {};
        for(var i in r) {
          var name = r[i].Name;
          delete r[i].Name;
          controls[name] = r[i];
        }
        if(Object.keys(controls).length == 1) { return controls[Object.keys(controls)[0]]; }
      })
    },
  },
  'Component': {
    'Get': function(name, controls) {
      if(typeof controls != 'Array') { controls = [controls]; } // handle single-item requests
      controls = controls.map(function(n) { return { 'Name': n }; });
      return call('Component.Get', { 'Name': name, 'Controls': controls });
    },
    'Set': function(name, control, value, ramp) {

      // Single-item case
      if(value) {
        control = [{
          'Name': control,
          'Value': value
        }]
        if(ramp) { control['Ramp'] = ramp; }
      }

      return call('Component.Set', { 'Name': name, 'Controls': control });

    },
    'GetComponents': function() {
      return call('Component.GetComponents');
    }
  },
  'ChangeGroup': {
    'AddControl': function(group, controls) {
      if(typeof controls != 'Array') { controls = [controls]; }
      return call('ChangeGroup.AddControl', { 'Id': group, 'Controls': controls });
    },
    'AddComponentControl': function(group, name, controls) {
      if(typeof controls != 'Array') { controls = [controls]; } // handle single-item requests
      controls = controls.map(function(n) { return { 'Name': n }; });
      return call('Component.AddComponentControl', {
        'Id': group,
        'Component': { 'Name': name, 'Controls': controls }
      });
    },
    'Remove': function(group, controls) {
      if(typeof controls != 'Array') { controls = [controls]; }
      return call('ChangeGroup.Remove', { 'Id': group, 'Controls': controls });
    },
    'Invalidate': function(group) {
      return call('ChangeGroup.Invalidate', { 'Id': group });
    },
    'Clear': function(group) {
      return call('ChangeGroup.Clear', { 'Id': group });
    },

    // TODO: AutoPoll

  }

  // TODO: Mixer

  // TODO: Loop Player

}