




// each scale is a set of notes
// they can be represented by a number from 0 to 4095
const Scales = (()=>{

    const intervalsFitInOctave = intervals => {
        const add = (acc,curr) => acc+curr;
        const sum = intervals.reduce(add);
        return sum == NUM_NOTES
    }

    const fromRootAndIntervals = (root, intervals) => {
        assert(intervalsFitInOctave(intervals),"intervals don't fit in octave");

        const notes = intervals.reduce((acc,curr)=>{
            return acc.push(acc[acc.length-1].plus(curr));
        },note);

        return {
            root:root,
            intervals:intervals
        }
    }

    const Intervals = (()=>{
        const ionian         = [2,2,1,2,2,2,1];
        const dorian         = [2,1,2,2,2,1,2];
        const phrygian       = [1,2,2,2,1,2,2];
        const lydian         = [2,2,2,1,2,2,1];
        const mixolydian     = [2,2,1,2,2,1,2];
        const aeolian        = [2,1,2,2,1,2,2];
        const locrian        = [1,2,2,1,2,2,2];
        const harmonic_minor = [2,2,1,3,1,2,1];
        const melodic_minorA = [2,1,2,2,2,2,1];
        const melodic_minorD = [2,1,2,2,1,2,2];

        const validate = intervals => {
            
            if(sum!=numNotes) throw "scale should have a width of " + numNotes + ", not " + sum;
        }
        
        return ({
            validate:validate
        })
    })
    
    return ({

    })
})()