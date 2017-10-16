const NUM_NOTES = 12;
const JUST_FREQUENCY_RATIOS = {
    0: math.fraction(1,1),
    1: math.fraction(16,15),
    2: math.fraction(9,8),
    3: math.fraction(6,5),
    4: math.fraction(5,4),
    5: math.fraction(4,3),
    6: math.fraction(45,32),
    7: math.fraction(3,2),
    8: math.fraction(8,5),
    9: math.fraction(5,3),
    10:math.fraction(9,5),
    11:math.fraction(15,8)
}

const semitonesToRatio = semis => {
    var result;
    const octaves = math.floor(semis/NUM_NOTES);
    const remainder = math.mod(semis,NUM_NOTES);
    const factor = JUST_FREQUENCY_RATIOS[remainder]
    return math.multiply(math.pow(2,octaves),factor);
}

const period = ratio => {
    // 1 / gcd(ratio,1) == lcm(1,denominator of ratio)
    return math.lcm(1,ratio.d);
}

const beating = ratio => {
    var result = math.abs(math.add(-1,ratio));
    return result;
}


const fractionToBinary = fraction => {
    return (fraction.n/fraction.d).toString(2);
}

const fs = x => math.format(x,{fraction:"ratio"});
const is = x => math.format(x,{fraction:"decimal"});

const run = () => {
    for(var i = -30; i < 30; ++i ){
        if(!math.mod(i,12)){
            console.log("-------------------------");
        }
        var ratio = semitonesToRatio(i);
        var per = period(ratio);

        var fb = fractionToBinary(ratio);
        var c = ratio.n.toString(2) + "/" + ratio.d.toString(2);
        var p = is(per);
        var b = fs(beating(ratio));
        console.log(i,b,p);//b.slice(0,10));

    }
    // major chord: 0,4,7

}
run();
