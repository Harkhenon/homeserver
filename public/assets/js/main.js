const getRotationDegrees = (obj) => {
    var matrix = obj.css("-webkit-transform") ||
    obj.css("-moz-transform")    ||
    obj.css("-ms-transform")     ||
    obj.css("-o-transform")      ||
    obj.css("transform");
    if(matrix !== 'none') {
        var values = matrix.split('(')[1].split(')')[0].split(',');
        var a = values[0];
        var b = values[1];
        var angle = Math.round(Math.atan2(b, a) * (180/Math.PI));
    } else { var angle = 0; }
    return (angle < 0) ? angle + 360 : angle;
}

$('.sidebar-toggle').click(() => {
    $('.ui.sidebar').sidebar('toggle');
});

const getMachineLoad = () => {
    $.ajax({
        type: 'GET',
        url: "/api/server/informations"
    })
    .done(function(data) {
        $('.system').append("<h2>Platform</h2>" + data.os);
        $('.cpu .load').css("transform", "rotate(" + Math.round(180 * data.cpuUsage / 100) + "deg)");
        $('.ram .load').css("transform", "rotate(" + Math.round(180 * data.ramUsage / 100) + "deg)");
        $('.disk .load').css("transform", "rotate(" + Math.round(180 * data.diskUsage / 100) + "deg)");
    });
}

getMachineLoad();
setInterval(() => {
    getMachineLoad();
}, 5000)
