// store a spectrum from 20hz to 20000hz
// 2 to 2000
// 2^1 to 2^ 11

const ear = (() => {
    const MIN_FREQ = 20; //hz (inclusive)
    const MAX_FREQ = 20000; //hz (exclusive)
    const samplesPerOctave = 50;
    const audibleOctaves = 10;
    const totalSamples = samplesPerOctave * audibleOctaves;

    const idealHarmonicSeriesWithRoot = f => {
        if(isAudibleFrequency(f)){
            const spectrum = new Array(totalSamples);
            var harmonic = 1;
            var amplitude = 1;       
            while(f < MAX_FREQ){
                spectrum[indexFromFrequency(f*harmonic)] = Math.pow(0.88,harmonic-1) * amplitude;
            }
        }
    }

})()

ear.prototype.isAudibleFrequency = f => f < MAX_FREQ && f >= MIN_FREQ;
ear.prototype.isAudibleIndex = i => i < totalSamples && i >= 0;
ear.prototype.indexFromFrequency = f => {
    if(isAudibleFrequency(f)){
        return Math.floor((f - 20) / 40);
    }
    throw "invalid frequency " + f;
}
ear.prototype.frequencyFromIndex = index => {
    if(isAudibleIndex(index)){
        return index * 40 + 20;
    }
    throw "invalid index " + index;
}