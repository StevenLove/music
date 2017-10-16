var Converter = require("./converter.js");

const Scorer = (()=>{
    /* These dissonance values rate various intervals on their dissonance.
    I got them by looking at a graph online 
    Here, the index in the array represents the pitch class that many semitones above the root*/
    const vagueDissonanceFromGraph = [0   , 5.5, 3  , 1.9, 2.2, 1.5, 2.7, 0.5, 2.7, .9 , 1.5, 2.1]
    
    const dissonanceOfIntervalClass = intervalClass => {
        return vagueDissonanceFromGraph[intervalClass];
    }

    /* Ignores the concept that a 9 and a 2 may have different levels of dissonance */
    const dissonanceOfInterval = interval => {
        intervalClass = Converter.intervalToIntervalClass(interval);
        return dissonanceOfIntervalClass(intervalClass);
    }

    /* Input: an array of interval classes
       Output: a total score of dissonance
       The input would look like this: [0,2,7].
       which is interpreted as a root, its second, and fifth
       And the result is the sum of dissonance for playing those notes,
       since this is a SUS2 it should be a bit higher than a major chord */
    const dissonanceOfIntervalClassChord = semitones => {
        return semitones.reduce((acc,curr)=>{
            return acc + dissonanceOfIntervalClass(curr);
        },0)
    }
    
    /* Calculates the 'roughness' of two sinusoidal tones played simultaneously.
    Input: frequencies and amplitudes of the two tones 
    Output: a number representing the roughness
    */
    const sineRoughness = (f1,f2,A1,A2) => {
        /* default amplitudes */
        if(A1 == undefined){A1=1}
        if(A2 == undefined){A2=1}
        /* labels */
        const fmax = Math.max(f1,f2);
        const fmin = Math.min(f1,f2);
        const Amax = Math.max(A1,A2);
        const Amin = Math.min(A1,A2);
        /* X term */
        const X = Amin * Amax;
        /* Y term */
        const Y = (2 * Amin) / (Amin + Amax)
        /* Z term */
        // constants
        const b1 = 3.5;
        const b2 = 5.75;
        const s1 = 0.0207;
        const s2 = 18.96;
        const s  = 0.24/(s1*fmin + s2)
        // calculation
        const firstTerm =   Math.exp(-b1*s*(fmax-fmin));
        const secondTerm = -Math.exp(-b2*s*(fmax-fmin));
        const Z = 5*firstTerm + 5*secondTerm;
        /* Full formula */
        const R = math.pow(X,0.1) * 0.5 * (math.pow(Y,3.11)) * Z;
        return R;
    }

    /* Calculates the roughness of two notes played simultaneously.
    Each note is interpreted to be a combination of sinusoidal tones, according to harmonics
    So a note with frequency f has harmonics at f*2, f*3, f*4, ...
    This function only calculates harmonics up to ... 5? for each note
    And assumes they go down in amplitude at a proportion of 0.88 each harmonic 
    And it just adds the total roughness of comparing each tone of each note against each tone of the other note*/
    const noteRoughness = (f1,f2) => {
        var roughness = 0;
        for(var i = 1; i < 6; ++i){
            for(var j = 1; j < 6; ++j){
                roughness += sineRoughness(f1*i,f2*j,math.pow(0.88,i),math.pow(0.88,j));
            }
        }
        return roughness;
    }

    /* This scores every interval against a chosen root
       This is as if every note were played along the root, which doesn't actually 
       happen, which makes this a poor choice for analyzing harmonicity */
    const scoreScenario = scenario => {
        const f1 = scenario.root.fq();
        return scenario.intervals.reduce((acc,curr)=>{
            f2 = scenario.root.interval(curr).fq();
            return acc + noteRoughness(f1,f2);
        },0)
    }

    return({
        dissonanceOfInterval:dissonanceOfInterval,
        dissonanceOfIntervalClass:dissonanceOfIntervalClass,
        dissonanceOfIntervalClassChord:dissonanceOfIntervalClassChord
    })
})()

module.exports = Scorer;