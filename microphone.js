const WebAudio = require("./webaudio.js");

var Microphone = (function(){
    
        // Parameters
        const inputSamples = 1024; // number of frames, has to be a power of two
        const numInputChannels = 1;
        const numOutputChannels = 1;
        const outputSampleRate = 32000;
    
        const VOLUME_UP_GAIN_AMOUNT = 3;
        // I can send a variable number of frames, and they will be interpreted at 32000 samples/second
        // I read in a power of 2 number of frames
        // assuming input of 48kHz...
        // I get 1.5 times as many frames as I need
        // so I divide 1024 by 1.5 and get ... 682.666666...
        // if I send 683 frames then I'm sending data representing more time than actually passed
        // and over a long time period, the audio playing will lag more behind the audio being recorded
        // if I send 682 frames then I'm sending data representing less time than actually passed
        // and playback outpaces recording so there will be rebuffering.
    
        const defaultConstraints = {audio:true,video:false};
    
    
        // Variables
        var audioCtx; 
        var resample; // function that resamples and converts audio data
        var processor; // processes the stream from getusermedia
        var reusableOutputArray; // holds processed mic data to be outputted
        var muteNode; // connects the processor to the speakers so that it runs, but doesn't echo your mic back to you
        var constraints = defaultConstraints; //used by getUserMedia to determine what we're getting
        var onPermissionGrantedFunc; // function to call when permission is granted
        var onStreamOpenedFunc;
        var stopStream; // function to stop the stream

        var streamSource; // audio node of microphone stream
        var connectedToProcessor = false;
    
        // What do you do with microphone data when it's ready?
        const doNothing = ()=>{}
        var micDataFunc = doNothing;
        var funcWhenEnabled = doNothing;
        var disabled = true;
        const funcWhenDisabled = doNothing;
        const setMicDataFunc = f =>{
            funcWhenEnabled = f;
            connectToProcessor;
        }
        const connectToProcessor = () => {
            if(connectedToProcessor)return;
            streamSource.connect(processor);
            connectedToProcessor = true;
        } 
        const disconnectFromProcessor = () => {
            if(connectedToProcessor){
                streamSource.disconnect(processor);
                connectedToProcessor = false;
            }
        }
        const enable = () => {
            if(disabled){
                console.log("mic enabled");
                micDataFunc = funcWhenEnabled;
                startRecording();
                disabled = false;
            }
            else{
                console.log("mic already enabled");
            }
        }
        const disable = () => {
            if(disabled){
                console.log("mic already disabled");
                return;
            }
            console.log("mic disabled");
            micDataFunc = funcWhenDisabled;
            stopRecording();
            disabled = true;
        }
    
    
    
        const init = () => {
            audioCtx = WebAudio.getContext();
            // we go through this mute node because the scriptprocessor node won't activate unless connected to the speakers
            const computerSpeakers = audioCtx.destination;
            muteNode = audioCtx.createGain();
            muteNode.gain.value = 0;
            muteNode.connect(computerSpeakers);
            processor = audioCtx.createScriptProcessor(inputSamples,numInputChannels,numOutputChannels);
        }
    
        const closeStreamImmediately = stream => {
            stream.getTracks().forEach(track=>{
                track.stop()
            });
        }
    
        var handleOpenedStream = function(stream) {
            stopStream = () => {
                stream.getTracks().forEach(track=>{
                    track.stop()
                });
            }
            processor.onaudioprocess = function(e){
                // console.log("processing microphone data");
                const input = e.inputBuffer.getChannelData(0);
                // const output = reusableOutputArray;
                // normally we would set output = e.outputBuffer.getChannelData(0);
                // but instead of processing this data and sending it on through
                // audio nodes to be played, we are getting off this train
                // and sending the data to some function 'f' elsewhere
                // resample(input,output);
                micDataFunc(input);
            }
            console.log("handle opened stream set streamsource");
            streamSource = audioCtx.createMediaStreamSource(stream)
            onStreamOpenedFunc();
            const volumeUpGainNode = audioCtx.createGain();
            volumeUpGainNode.gain.value = VOLUME_UP_GAIN_AMOUNT;
    
            // stream -> processor -> volumeUp -> muteNode -> speakers
            // streamSource.connect(processor);
            processor.connect(volumeUpGainNode);
            volumeUpGainNode.connect(muteNode);
        }

        const getNode = () => {
            disconnectFromProcessor();
            return streamSource;
        }
    
        const stopRecording = () => {
            if(stopStream){
                stopStream();
            }
            else{
                debugMsg("failed to stop microphone recording");
            }
        }
    
        const startRecording = () => {
            console.log("beginning recording with microphone");
            return navigator.mediaDevices.getUserMedia(constraints)
            .then(stream=>{
                handleOpenedStream(stream);
                return stream;
            })
            .catch(e=>{
                console.error("microphone failed to start recording");
                throw e;
            })
        }
    
        const getPermissions = () => {
            console.log("getting microphone permissions");
            return navigator.mediaDevices.getUserMedia(constraints)
            .then(stream=>{
                onPermissionGrantedFunc();
                closeStreamImmediately(stream);
            })
            .catch(e=>{
                console.error("failed to get microphone permissions");
                throw e;
            })
        }
    
    // These methods have a problem as old microphone data gets clogged in there
    // and comes out when you resume
    
        // // break the MediaStreamSource -> ScriptProcessor -> (mute)GainNode -> audioCtx.destination(speakers) chain
        // // by disconnecting the muteNode
        // var pause = function(){
        //     muteNode.disconnect(computerSpeakers);
        // }
        // // reconnect the chain
        // var resume = function(){
        //     muteNode.connect(computerSpeakers);
        // }
    
        const setDevice = id => {
            console.log("using microphone device ",id);
            constraints = {
                audio: {deviceId: id ? {exact: id} : undefined},
            };
        }
    
        const onPermissionGranted = func => {
            onPermissionGrantedFunc = func;
        }

        const onStreamOpened = func => {
            onStreamOpenedFunc = func;
        }
    
        // keeps track of which selectors (by their IDs) are using the microphone
        const Controller = (()=>{
            ids = {};
            const addID = id =>{
                ids[id] = true;
                if(count()==1) enable();
            }
            const removeID = id => {
                ids[id] = false;
                if(count()==0) disable();
            }
            const count = () => {
                return Object.keys(ids).filter(key=>ids[key]==true).length;
            }
            return ({
                addID:addID,
                removeID:removeID
            })
        })()
    
    
        return({
            doWithMicData:setMicDataFunc,
            enable:enable,
            disable:disable,
            setDevice:setDevice,
            init:init,
            getPermissions:getPermissions,
            onPermissionGranted:onPermissionGranted,
            onStreamOpened:onStreamOpened,
            getNode:getNode
        })
        
    
    })()

    module.exports = Microphone;