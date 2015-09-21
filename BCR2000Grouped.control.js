
/*
 * Samba Godschynski
 * The 4 buttons are now for grouping. We doing this by adding group*1000 to the controller indices.
 * e.g.: group 0, CC81 => 81, group 1, CC81 => 1081 ... 
 */

loadAPI(1);

host.defineController("Behringer", "BCR2000Grouped", "1.0", "6c686da6-35d8-4759-9b07-a8b3cd2b12f4");
host.defineMidiPorts(1, 1);

var LOWEST_CC = 1;
var HIGHEST_CC = 4128;
var currentPrj = null;

function Groups() {
    var self = this;
    self._group = 0;
    self._out = null;
    /*
        returns true if cc is a group.
    */
    self.isGroup = function(cc)
    {
        if (cc>108) {
            return false;
        }
        return (cc - 105) >= 0;
    } 
    
    /*
        set the group 
    */
    self.setGroup = function(cc, value)
    {
        if (cc>108) {
            return false;
        }
        var gr = (cc - 105) + 1
        if (gr<=0) {
            return;
        }
        if (self._group>0 && gr != self._group) {
            // reset old group
            var out = host.getMidiOutPort(0);
            out.sendMidi(0xB0, self._group + 104, 0);
        }
        if (value===0) {
            self._group = 0;
        } else {
            self._group = gr;
        }
        self._updateGroupParams(self._group);
    }
    
    /* 
        returns the new controller index
    */
    self.getIndex = function(index, group) {
        if (!group) {
            group = self._group;
        }
        return index + group * 1000
    }
    
    /* 
        returns the new cc
    */
    self.getCC = function(index) {
        return index - self._group * 1000
    }
    
    self.sendCC = function(data1, data2) {
        if (self._out===null) {
            self._out = host.getMidiOutPort(0);
        }
        var cc = self.getCC(data1);
        dprint("CC " + cc);
        if (cc>127 || cc<0) {
            return;
        }
        self._out.sendMidi(0xB0, cc, data2);
    }
    
    /* 
        set group to 0 
    */
    self.reset = function() {
        var out = host.getMidiOutPort(0);
        out.sendMidi(0xB0, 105, 0);
        out.sendMidi(0xB0, 106, 0);
        out.sendMidi(0xB0, 107, 0);
        out.sendMidi(0xB0, 108, 0);
        self._group = 0;
    }
    
   /*
        update the group params
   */
   self._updateGroupParams = function (group) {
       dprint("group " + group);
       sendLock=0;
       host.scheduleTask( function() {
            for (var i=0; i<128; ++i) {
                var index = self.getIndex(i, group);
                userControls.getControl(index).inc(1, 1024); // unfortunately there is no way to read out a controller value
                userControls.getControl(index).inc(-1, 1024); // so have to use this dirty hack
            }
       }, null, 100);
   }
    
}

var groups = new Groups();

var ctrlValues = {}; // will be set by value observer

/* 
    we prevent midi loop backs by counting all in-events
    and check (a bit delayed) if all events was consumed, then we unlock
    by setting sendLock to 0. 
*/
var sendLock = 0;

function dprint(x) {
    //println(x)
}

function makeIndexFunction(index, f) {
    return function (value) {
        f(index, value);
    };
}

function init() {
    host.getMidiInPort(0).setMidiCallback(onMidi);
    generic = host.getMidiInPort(0).createNoteInput("", "??????");
    generic.setShouldConsumeEvents(false);
    app = host.createApplication();
    groups.reset();
    // Make CCs 1-119 freely mappable
    userControls = host.createUserControls(HIGHEST_CC - LOWEST_CC + 1);

    for (var i = LOWEST_CC; i <= HIGHEST_CC; i++) {
        var idx = i - LOWEST_CC;
        var ctrl = userControls.getControl(idx);
        ctrl.setLabel("CC" + i);
        ctrl.addValueObserver(128, makeIndexFunction(idx, function (i, value) {
            dprint("obsrv: " + i + "," + value);
            ctrlValues[i + 1] = value;
            if (sendLock == 0) {
                groups.sendCC(i + 1, value); // send back to device
            } else {
                host.scheduleTask(function (data) { // check if we can unlock
                    if (data == sendLock) {
                        dprint("UNLOCK");
                        sendLock = 0;
                    }
                }, [sendLock], 1000);
            }
        }));
    }
}


function onMidi(status, data1, data2) {
    if (isChannelController(status)) {
        if (groups.isGroup(data1)) {
            groups.setGroup(data1, data2);
            return;
        }
        if (data1 >= LOWEST_CC && data1 <= HIGHEST_CC) {
            dprint("LOCK");
            sendLock++;
            var index = groups.getIndex(data1 - LOWEST_CC);
            //dprint(index);
            userControls.getControl(index).set(data2, 128);
        }
    }
}

function exit() {
}
