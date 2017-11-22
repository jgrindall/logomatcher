var hougher = function hougher(canvas){
    var ctxfoo = canvas.getContext('2d');
    ctxfoo.fillStyle = "rgba(0, 0, 0, 1)";
    ctxfoo.fillRect(0, 0, canvas.width, canvas.height);
    var canvasbar = document.getElementById('bar');
    var ctxbar = canvasbar.getContext('2d');
    ctxbar.fillStyle = "rgba(0, 0, 0, 1)";
    ctxbar.fillRect(0, 0, canvasbar.width, canvasbar.height);
    var i, j;
    var pp;
    var count = 500;
    var points1 = [];
    var points = [];
    var x,y,t,xrand,yrand;
    var xrscale,yrscale;
    xrscale = 0.025;
    yrscale = 0.025;
    for (i = 0; i < count; i++)
    {
        xrand = Math.random();
        yrand = Math.random();
        t=i/count;

        //t = 2*(i-count/2)/count;
        //t = i/count;
        var rho1,rho2, rr;
        rho1 = 2*Math.PI*t;        
        rho2 = Math.PI*Math.floor(4*t + 0.5)/2;
        rr = .5/Math.cos(rho1-rho2 + Math.PI/3);
        x= xrand*xrscale + Math.cos(rho1)*rr;
        y= yrand*xrscale + Math.sin(rho1)*rr;
        
        points.push(
        {
            x:x,
            y: y
        });
    }

    var hspacepoints = [];
    var m, b, r0, rho, p1, p2, xd;
    function distanceMatchMaker(r1,r2){
        function square(f){
            return f*f;
        }
        var ds1 = square(r1);
        var ds2 = square(r2);
        return function(p1,p2){
            var ds = square(p2.x - p1.x) + square(p2.y - p1.y);
            return ds1 < ds && ds< ds2;
        }
    }
    var distanceMatch = distanceMatchMaker(8*xrscale,0.50);
    for (i = 1; i < count; i++)
    {
        p1 = points[i];
        for (j = 0; j < i; j++)
        {
            p2 = points[j];

            if(distanceMatch(p1,p2)){
                xd = p2.x - p1.x;
                if (xd == 0)
                {
                    rho = Math.PI / 2;
                    r0 = 0;
                }
                else
                {
                    m = (p2.y - p1.y) / xd;
                    rho = Math.atan(m);
                    b = -1 * m * p1.x + p1.y;
                    r0 = Math.abs(b / Math.sqrt(1 + m * m));
                }
                hspacepoints.push(
                {
                    rho: rho,
                    r0: r0
                });
            }
        }
    }
	return {
		points:points,
		hspacepoints:hspacepoints
	};
}


var drawHough = function(obj){
	var canvas0 = document.createElement("canvas");
	canvas0.width = 500;
	canvas0.height = 500;
	var ctx0 = canvas0.getContext("2d");
	var canvas1 = document.createElement("canvas");
	canvas1.width = 500;
	canvas1.height = 500;
	var ctx1 = canvas1.getContext("2d");
	$("body")
		.appendChild(canvas0)
		.appendChild(canvas1);
	
	
	var drawit = function(pdata, conf){
		var ctx = conf.ctx;
		var index;
		var hscale, vscale, hdiff, vdiff, radius;
		hscale = conf.hscale;
		vscale = conf.vscale;
		hdiff = conf.hdiff;
		vdiff = conf.vdiff;
		radius = conf.radius;
		ctx.fillStyle = conf.fillStyle;
		var pdata_length = pdata.length;
		for (index = 0; index < pdata_length; index++)
		{
			ipdata = pdata[index];
			ctx.beginPath();
			ctx.arc(ipdata.bx * hscale + hdiff, ipdata.by * vscale + vdiff, radius, 0, 2 * Math.PI, true);
			ctx.fill();
		}
	};
	
	drawit(obj.points.map(function (p)
    {
        return {
            bx: p.x,
            by: p.y
        };
    }),
    {
        ctx: ctx0,
        hscale: 250,
        vscale: -250,
        hdiff: 250,
        vdiff: 250,
        radius: 1,
        fillStyle: "rgba(255,255,255,0.9)"
    });
    drawit(obj.hspacepoints.map(function (p)
    {
        return {
            bx: p.r0,
            by: p.rho
        };
    }),
    {
        ctx: ctx1,
        hscale: 250,
        vscale: -500/Math.PI,
        hdiff: 1,
        vdiff: 750/Math.PI,
        radius: 1,
        fillStyle: "rgba(255,255,255,0.05)"
    });
}

