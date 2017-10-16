const Chords = (()=>{
    const MAJOR = {
        toString:()=>"",
        name:"major",
        intervals:[4,3,5]
    }
    const MAJOR7 = {
        toString:()=>"maj7",
        name:"major 7",
        intervals:[4,3,4,1]
    }
    const DEFAULT_TYPE = MAJOR;


    const make = (note,type)=>{
        if(!type) type = DEFAULT_TYPE;
        const notes = type.intervals.reduce((acc,curr)=>{
            return acc.push(acc[acc.length-1].plus(curr));
        },note);
        
        return({
            notes:notes
        })
    }
    return({

    })
})()
