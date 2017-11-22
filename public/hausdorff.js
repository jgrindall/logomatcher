(function(){
	var _hausdorff = function(points, points1, vector){
		var min, len0, len1;
		var max = Number.MIN_VALUE;
		len0 = points.length;
		len1 = points1.length;
		var point, point1;
		for (var i = 0; i < len0; i++){
			point = points[i];
			min = Number.MAX_VALUE;
			for (var j = 0; j < len1; j++){
				// Euclidean distance.
				point1 = points1[j];
				var dis = Math.hypot(point.x - point1.x + vector.x, point.y - point1.y + vector.y);
				if (dis < min){
					min = dis;
				}
				else if (dis == 0){
					break;
				}
			}
			if (min > max){
				max = min;
			}
		}
		return max;
	};
			
	var _center = function(shape){
		var width = shape.width;
		var x = 0;
		var y = 0;
		var size = 0;
		for (var i = 0; i < shape.height; ++i){
			for (var j = 0; j < width; ++j){
				if (shape.data[(j + i * width) * 4 + 3]){
					x += j;
					y += i;
					++size;
				}
			}
		}
		return { x: x / size, y: y / size };
	};
		
	  
	var _distance = function(shape, shape1){
		var points = [];
		var points1 = [];
		var width = shape.width;
		for (var y = 0; y < width; y += 4){
			for (var x = 0; x < width; x += 4){
				if (shape.data[(x + y * width) * 4 + 3] > 0){
					points.push({ x, y, });
				}
				if (shape1.data[(x + y * width) * 4 + 3] > 0){
					points1.push({ x, y, });
				}
			}
		}
		var center = _center(shape);
		var center1 = _center(shape1);
		var vector = { x: center.x - center1.x, y: center.y - center1.y };
		var h1 = _hausdorff(points, points1, vector);
		vector.x *= -1;
		vector.y *= -1;
		var h2 = _hausdorff(points, points1, vector);
		var max = Math.max(h1, h2);
		return Math.pow(max * Math.sqrt(2) / 300, 1 / 1.4);
	};

	window.hausdorffDistance = _distance;

})();
