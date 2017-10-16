const d3plotter = (spectrum=>{

    var sData = spectrum.getAll();
        
    var margin = {top: 20, right: 20, bottom: 30, left: 50},
        width = 400 - margin.left - margin.right,
        height = 100 - margin.top - margin.bottom;


    var x = d3.scaleLinear()
        .range([0, width])

    var y = d3.scaleLinear()
        .range([height, 0]);

    

    // var xAxis = d3.svg.axis()
    //     .scale(x)
    //     .orient("bottom");

    // var yAxis = d3.svg.axis()
    //     .scale(y)
    //     .orient("left");

    var line = d3.line()
        .x(function(d) { return x(d.x); })
        .y(function(d) { return y(d.y); });

    var svg = d3.select("body").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    
    const parseData = dataToParse => {
        return dataToParse.map(function(d,i) {
            return {
                x:i,
                y:d
            };
            
        });
    }

    var data = parseData(sData);

    console.log("initial data",data);


    x.domain(d3.extent(data, function(d) { return d.x; }));
    y.domain(d3.extent(data, function(d) { return d.y; }));


    /* Add x Axis */
    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x));

    /* text label for x Axis */
    svg.append("text")
        .attr("transform",
            "translate(" + (width/2) + " ," + 
                            (height + margin.top + 20) + ")")
        .style("text-anchor", "middle")
        .text("Frequency");

    // Add the y Axis
    svg.append("g")
        .call(d3.axisLeft(y));

    // text label for the y axis
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x",0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Amount"); 
    // svg.append("g")
    //     .attr("class", "x axis")
    //     .attr("transform", "translate(0," + height + ")")
    //     .call(xAxis);

    // svg.append("g")
    //     .attr("class", "y axis")
    //     .call(yAxis)
    //     .append("text")
    //     .attr("transform", "rotate(-90)")
    //     .attr("y", 6)
    //     .attr("dy", ".71em")
    //     .style("text-anchor", "end")
    //     .text("Amplitude");

    svg.append("path")
        .datum(data)
        .attr("class", "line")
        .attr("d", line);

    const updateWithSpectrum = spectrum => {
        var data = parseData(spectrum.getAll());


        // Scale the range of the data again 
        x.domain(d3.extent(data, function(d) { return d.x; }));
        y.domain([0, d3.max(data, function(d) { return d.y; })]);

        svg.select(".line")
            .attr("d",line(data))

        svg.select(".x.axis") // change the x axis
            .call(xAxis);
        svg.select(".y.axis") // change the y axis
            .call(yAxis);

    }
    return ({
        update:updateWithSpectrum
    })
});