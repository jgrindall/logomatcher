var Matcher = function(attemptCanvas, targetCanvas, options){
	
	var WIDTH = attemptCanvas.width;
	var HEIGHT = attemptCanvas.height;
	
	var DEFAULT_OPTIONS = {
		ignoreColor:true
	};
	
	options = _.defaults(options || {}, DEFAULT_OPTIONS);
	
	var data0 = attemptCanvas.getContext("2d").getImageData(0, 0, attemptCanvas.width, attemptCanvas.height);
	var data1 = targetCanvas.getContext("2d").getImageData(0, 0, targetCanvas.width, targetCanvas.height);
	
	var OFFSETS = [
		{dx:0, dy:0},
		{dx:1, dy:0},
		{dx:0, dy:-1}
	];
	
	var _getPixelAt = function(i, j, imgData){
		var index;
		if(i >= 0 && i < WIDTH && j > 0 && j < HEIGHT){
			index = (j*WIDTH + i)*4;
			return {
				r:imgData.data[index + 0],
				g:imgData.data[index + 1],
				b:imgData.data[index + 2],
				a:imgData.data[index + 3]
			};
		}
		else{
			return {
				r:0,
				g:0,
				b:0,
				a:0
			};
		}
	}
	
	var data = [];
	
	_.each(OFFSETS, function(offset, offsetIndex){
		data[offsetIndex] = {
			"offsetIndex":offsetIndex,
			"numMatch":0,
			"numMismatch":0,
			"numMissing":0,
			"numExtra":0,
			"totalPixelsUsed":0
		}
	});
	
	
	var TOLERANCE = 255;
	var TOLERANCE2 = TOLERANCE*TOLERANCE;
	
	var _isClose = function(obj0, obj1){
		var dr = obj0.r - obj1.r;
		var dg = obj0.g - obj1.g;
		var db = obj0.b - obj1.b;
		var da = obj0.a - obj1.a;
		if(options.ignoreColor){
			return (da*da < TOLERANCE2);
		}
		else{
			var dSqr = dr*dr + dg*dg + db*db + da*da;
			return (dSqr < TOLERANCE2);
		}
	};
	
	var _isMatch = function(obj0, obj1){
		return _pixelIsFull(obj0) && _pixelIsFull(obj1) && _isClose(obj0, obj1);
	};
	
	var _isMismatch = function(obj0, obj1){
		return _pixelIsFull(obj0) && _pixelIsFull(obj1) && !_isClose(obj0, obj1);
	};
	
	var _isMissing = function(obj0, obj1){
		return _pixelIsFull(obj1) && !_pixelIsFull(obj0);
	};
	
	var _isExtra = function(obj0, obj1){
		return _pixelIsFull(obj0) && !_pixelIsFull(obj1);
	};
	
	var _pixelIsFull = function(obj){
		return (obj.a > 30);
	};
	
	var attempt_rgba, target_rgba;
		
	for(var i = 0; i < WIDTH; i++){
		for(var j = 0; j < HEIGHT; j++){
			_.each(OFFSETS, function(offset, offsetIndex){
				attempt_rgba = _getPixelAt(i + offset.dx, j + offset.dy, data0);
				target_rgba = _getPixelAt(i, j, data1);
				if(_pixelIsFull(attempt_rgba) || _pixelIsFull(target_rgba)){
					//console.log(attempt_rgba, target_rgba, _pixelIsFull(attempt_rgba), _pixelIsFull(target_rgba));
					data[offsetIndex].totalPixelsUsed++;
					if(_isMatch(attempt_rgba, target_rgba)){
						//console.log("match");
						data[offsetIndex].numMatch++;
					}
					else if(_isMismatch(attempt_rgba, target_rgba)){
						//console.log("mismatch");
						data[offsetIndex].numMismatch++;
					}
					else if(_isMissing(attempt_rgba, target_rgba)){
						//console.log("missing");
						data[offsetIndex].numMissing++;
					}
					else if(_isExtra(attempt_rgba, target_rgba)){
						//console.log("extra");
						data[offsetIndex].numExtra++;
					}
				}
			});
		}
	}
	
	_.each(OFFSETS, function(offset, offsetIndex){
		data[offsetIndex].percentageMatch =	 		parseFloat((100*data[offsetIndex].numMatch/data[offsetIndex].totalPixelsUsed).toFixed(2));
		data[offsetIndex].percentageMismatch =  	parseFloat((100*data[offsetIndex].numMismatch/data[offsetIndex].totalPixelsUsed).toFixed(2));
		data[offsetIndex].percentageMissing =  		parseFloat((100*data[offsetIndex].numMissing/data[offsetIndex].totalPixelsUsed).toFixed(2));
		data[offsetIndex].percentageExtra =  		parseFloat((100*data[offsetIndex].numExtra/data[offsetIndex].totalPixelsUsed).toFixed(2));
	});
	
	console.log(data);
	
	var sorted = _.sortBy(data, function(obj){
		return -obj.percentageMatch;
	});;
	
	return sorted[0];
	
};