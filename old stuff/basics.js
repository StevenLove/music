// Pollute the global namespace with these! 

const MIN_OCTAVE = -2;
const NUM_NOTES = 12;
const OCTAVE_UNSPECIFIED = {
    toString:()=>"",
    specified:false,
}
const OCTAVES = {};
[-2,-1,0,1,2,3,4,5,6,7,8,9,10].forEach(num=>{
    OCTAVES[num] = {
        toString:()=>"("+num+")",
        specified:true,
        value:num
    }
})
const DEFAULT_OCTAVE = OCTAVE_UNSPECIFIED



const SHARP = {
    toString:()=>"#",
    value:1
}
const FLAT = {
    toString:()=>"b",
    value:-1
}
const NO_MODIFIER = {
    toString:()=>"",
    value:0
}
const C = {
    toString:()=>"C",
    value:0
}
const D = {
    toString:()=>"D",
    value:2
}
const E = {
    toString:()=>"E",
    value:4
}
const F = {
    toString:()=>"F",
    value:5
}
const G = {
    toString:()=>"G",
    value:7
}
const A = {
    toString:()=>"A",
    value:9
}
const B = {
    toString:()=>"B",
    value:11
}