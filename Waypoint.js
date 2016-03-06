    /*
	 * Bronxville Drone Flight Tool
	 * Uses Cesium to simply adding and removing Waypoints from, and exporting a custom Flight Plan based on QGC WPL 110.
	 *
	 * The output format is not currently the same as Ardupilot's .waypoint files, but modifying getFlightPlan() easily could make it.
	 *
	 * Written by Charlie Vorbach 
	 * 
	 * Bewarned, this is an uncommented, nightmare-workaround kludge. Proceed at your own risk.
	 *	-----Strike that------ This is now extensively commented. While it may still contain a few 'quirks' it shouldn't be too hard to follow.
	 */

	//Parameters
	const MAX_PARAM = 4;
	const RAD_TO_DEG = 180 / Math.PI;

	const MIN_HEIGHT = 1;
	const DEFAULT_RADIUS = 2;
	const DEFAULT_LAT = 40.938076;
	const DEFAULT_LNG = -73.829415;

	const COOR_PRECIS = 6;
	const OTHER_PRECIS = 1;

	//Globals
	var viewer = new Cesium.Viewer('cesiumContainer');
	var scene = viewer.scene;
	var numberOfWaypoints = 0;

	//Event Listeners
	var createWaypoint = new Cesium.ScreenSpaceEventHandler(scene.canvas);	//Create a waypoint where the canvas is double-clicked
	var removeWaypoint = new Cesium.ScreenSpaceEventHandler(scene.canvas);	//Remove a waypoint if it is right-clicked
	var selectWaypoint = new Cesium.ScreenSpaceEventHandler(scene.canvas);  //Load a waypoint in the tool bar if it is clicked

	//Zoom to Bronxville High School
	viewer.camera.setView({
        destination : Cesium.Cartesian3.fromDegrees(DEFAULT_LNG, DEFAULT_LAT, 550)
    });


	//Event Listeners


	//Create a waypoint where the canvas is double-clicked
	createWaypoint.setInputAction(function (click) {

		//Get the click's (x,y) position on the globe
        var cartesian = viewer.camera.pickEllipsoid(click.position, scene.globe.ellipsoid);

        //If it is a valid position
        if (cartesian) {

        	//Transform it to Coordinates (Latitude, Longitude)
            var cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            numberOfWaypoints++;	//increment the number of waypoints

            //Create Waypoint at that position (an Entity Collection)
            var waypoint = viewer.entities.add({
            	name : "Waypoint " + numberOfWaypoints,
            	type : "waypoint",
            	pointNumber: numberOfWaypoints,
            	latitude: (cartographic.latitude * RAD_TO_DEG),	 //Convert Coordinate radians to degree
            	longitude: (cartographic.longitude * RAD_TO_DEG),
            	position : Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 1),

            	point : {
            		pixelSize : 7,
            		color : Cesium.Color.WHITE,
            		outlineColor : Cesium.Color.BLUE,
            		outlineWidth : 2
            	},

            	label : {
					text : 'Waypoint ' + numberOfWaypoints,
 			   		font : '14pt monospace',
					style: Cesium.LabelStyle.FILL_AND_OUTLINE,
					outlineWidth : 2,
					verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
			    	pixelOffset : new Cesium.Cartesian2(0, -9)
				},
            });

            //Create Infobox for Waypoint
	 		waypoint.description = "Command: " + "<br> Latitude: " + waypoint.latitude.toFixed(6) + "<br> Longitude: " + waypoint.longitude.toFixed(6) 
	 		+ "<br> Altitude: " + "<br> Radius: "; 

	 		//Update Waypoint # in Tool Bar
            document.getElementById('WaypointNumber').setAttribute('max', String(numberOfWaypoints));
            document.getElementById('WaypointNumber').value = numberOfWaypoints;

            //Update Toolbar and Waypoint Path
            switchToolbar(waypoint);
            updatePolyline();

            viewer.selectedEntity = waypoint; //Select waypoint

        } 
		else {
            alert("Couldn't pick globe.")
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);


	//Remove a waypoint if it is right-clicked
	removeWaypoint.setInputAction(function(click) {
		var pickedObject = pickEntity(click.position);	//Get (pick) whatever entity is at the click's position

		//If that entity is a defined as a waypoint
		if(pickedObject != undefined  && pickedObject.type == "waypoint") { 

			//Change Waypoint numbers
			var count = pickedObject.pointNumber;
			loopWaypoints(function f(waypoint){
				if(waypoint.pointNumber > pickedObject.pointNumber) {
					changeNumber(waypoint, count);
					count++;
				}
			});
			
			//Remove Waypoint
			viewer.entities.remove(pickedObject);
			numberOfWaypoints--;

			//Update Waypoint # in Tool Bar
			document.getElementById('WaypointNumber').setAttribute('max', String(numberOfWaypoints));

			//Update Toolbar and Waypoint Path
			switchToolbar(getWaypointByNumber(pickedObject.pointNumber));
			updatePolyline();
		}

	}, Cesium.ScreenSpaceEventType.RIGHT_CLICK);


	//Load a waypoint in the tool bar if it is clicked
	selectWaypoint.setInputAction(function (click) {
		var pickedObject = pickEntity(click.position);	//Get (pick) whatever entity is at the click's position

		//If that entity is a defined as a waypoint
		if(pickedObject != undefined  && pickedObject.type == "waypoint") {

			//update the toolbar
			switchToolbar(pickedObject);
		} 
		else {
			clearWaypointControls(); //Clear the toolbar if it is not a waypoint
		}

	}, Cesium.ScreenSpaceEventType.LEFT_CLICK);


	 // Handles change event in toolbar fields (other than waypoint #)
	 function updateWaypoints() {
	 	waypoint = viewer.selectedEntity;	//get the selected waypoint

	 	//Update the waypoint
	 	setWaypoint(waypoint);

	 	//Update the Waypoint Line
	 	updatePolyline();
	 }


	 // Handles change event in waypoint # toolbar field. Changes waypoint's number.
	 function moveWaypoint () {
	 	//get waypoint
		var waypoint = viewer.selectedEntity;

	 	//Check that waypoint is really selected
	 	if(waypoint != undefined && waypoint.type == 'waypoint') {

		 	//Get info
		 	var moveTo = document.getElementById('WaypointNumber').value;
		 	var currentPos = waypoint.pointNumber;

		 	//Move waypoint
		 	if(moveTo != currentPos)	{

			 	if(0 < moveTo && moveTo <= numberOfWaypoints) { //Check that move is valid
			 		shiftPoints(moveTo, currentPos);
			 		changeNumber(waypoint, moveTo); //Move waypoint
			 	}

			 	else if (moveTo > numberOfWaypoints) {	//if over, set to max
			 		moveTo = numberOfWaypoints;
					shiftPoints(moveTo, currentPos);
			 		changeNumber(waypoint, moveTo); //Move waypoint
			 		document.getElementById('WaypointNumber').value = numberOfWaypoints;
			 	}	
			 	else {	//if under, set to min
			 		moveTo = 1;
					shiftPoints(moveTo, currentPos);
			 		changeNumber(waypoint, moveTo); //Move waypoint
			 		document.getElementById('WaypointNumber').value = 1;
			 	}
			 	updatePolyline();	//Change Waypoint line as well
			}
		}
	}


	//Handels click event on export button. Converts Flight Plan to .waypoints file.
	function exportList () {
		var flightPlan = getFlightPlan (); 								//Turn waypoints' data in to a string
		var dataFile = new Blob([flightPlan], {type: 'text/plain'});	//Turn string into file-like Blob
		var download = document.getElementById('download');

		if(download.href == window.location.href) {
			//link Blob to downloads
			download.href= window.URL.createObjectURL(dataFile);

			//Create button to click
			var button = document.createElement("BUTTON");
			button.appendChild(document.createTextNode("Download"));

			//Add button to document
			download.appendChild(button);
		} 
		else {
			window.URL.revokeObjectURL(download.firstChild.href);	//Destroy old URL to caulk memory leak
			download.href = window.URL.createObjectURL(dataFile);	//link new URL to file
		}

	}


	//Helper Functions


	//Breaks Waypoints into a Flight Plan string
	function getFlightPlan () {
		var flightPlan = "";
		var waypoints = getSortedPoints();

		waypoints.forEach(function f(point) {
			flightPlan += (point.number - 1) + ", "; //get index
			flightPlan += "0, 0, ";					 //skip these
			
			var command = point.command.split(" ");  //Get command and maxium number of parameters
			for(var i = 0; i < MAX_PARAM + 1; i++) {
				if(i < command.length) {
					flightPlan+= command[i] + ", "
				}
				else {
					flightPlan+= ", ";
				}
			}

			//Get Coordinates
			flightPlan += point.longitude + ", " + point.latitude + ", " + point.height + ", ";
			//Get Radius
			flightPlan += point.radius + "\n";
		});

		return flightPlan
	}


	/*
	 * Changes toolbar to display a waypoint's data
	 * @param {Entity} the waypoint to switch to
	 */
	 function switchToolbar(waypoint) {
	 	if(waypoint != undefined){
	 		document.getElementById('WaypointNumber').value = waypoint.pointNumber;
	 		document.getElementById('Command').value = (waypoint.command != undefined) ? waypoint.command : "";
	 		document.getElementById('Latitude').value = waypoint.latitude.toFixed(COOR_PRECIS);
	 		document.getElementById('Longitude').value = waypoint.longitude.toFixed(COOR_PRECIS);
	 		document.getElementById('Altitude').value = (waypoint.height != undefined) ? waypoint.height.toFixed(OTHER_PRECIS) : "";
	 		document.getElementById('Radius').value = (waypoint.raduis != undefined) ? waypoint.raduis.toFixed(OTHER_PRECIS) : "";
	 	}
	 	else {
	 		clearWaypointControls();
	 	}
	 }


	/**
	 * Returns the top-most Entity at the provided window coordinates
	 * or undefined if no Entity is at that location.
	 *
	 * @param {Cartesian2} windowPosition The window coordinates.
	 * @returns {Entity} The picked Entity or undefined.
	 */
	 function pickEntity(windowPosition) {
	 	var picked = viewer.scene.pick(windowPosition);
	 	if (Cesium.defined(picked)) {
	 		var id = Cesium.defaultValue(picked.id, picked.primitive.id);
	 		if (id instanceof Cesium.Entity) {
	 			return id;
	 		}
	 	}
	 	return undefined;
	 };


	 /**
	 * Returns the waypoint with the given number
	 *
	 *@param number the number of the desired waypoint
	 *@returns {entity} the waypoint
	 */
	 function getWaypointByNumber(number) {
	 	loopWaypoints(function f(waypoint) {
	 		if(waypoint.pointNumber == number) {
	 			return waypoint;	
	 		}
	 	});
	 	return undefined;
	 }
	

	/*
	 * Copys array of Waypoint data, sorts it by waypoint number, and returns it
	 * @return array sorted array of waypoints
	 */
	 function getSortedPoints() {
	 	var points = [];

	 	loopWaypoints(function f (waypoint){
	 		points.push({
	 			number: waypoint.pointNumber,
	 			command: (waypoint.command != undefined) ? waypoint.command : "",
	 			longitude: waypoint.longitude,
			 	latitude: waypoint.latitude,
	 			height: (waypoint.height != undefined) ? waypoint.height : MIN_HEIGHT,
	 			radius:(waypoint.radius != undefined) ? waypoint.radius : DEFAULT_RADIUS
	 		});
	 	});

	 	points.sort(function f(pointOne, pointTwo) {
	 		return pointOne.number - pointTwo.number;
	 	});

	 	return points;
	 }


	 /*
	  * Changes waypoint data to the values currently in the toolbar fields
	  * @param {Entity} the waypoint to set
	  */
	 function setWaypoint(waypoint) {

	 	//Get value from the field and set the waypoint property to it 

	 	waypoint.command = document.getElementById('Command').value;

	 	var latitude = parseFloat(document.getElementById('Latitude').value);
	 	waypoint.latitude = (!isNaN(latitude)) ? latitude : DEFAULT_LAT;

	 	var longitude = parseFloat(document.getElementById('Longitude').value);
	 	waypoint.longitude = (!isNaN(longitude)) ? longitude : DEFAULT_LNG;

	 	var height = parseFloat(document.getElementById('Altitude').value);
	 	waypoint.height = (!isNaN(height) && height > 1) ? height : 1;

	 	var raduis = parseFloat(document.getElementById('Radius').value);
	 	waypoint.raduis = (!isNaN(raduis)) ? raduis : DEFAULT_RADIUS;

	 	//Update position
	 	waypoint.position = Cesium.Cartesian3.fromDegrees(waypoint.longitude, waypoint.latitude,waypoint.height);

	 	//Update infobox
	 	waypoint.description = "Command: " + String(waypoint.command) + "<br> Latitude: " + waypoint.latitude.toFixed(COOR_PRECIS) + "<br> Longitude: " + waypoint.longitude.toFixed(COOR_PRECIS)
	 		+ "<br> Altitude: " + waypoint.height.toFixed(OTHER_PRECIS) + "<br> Radius: " + waypoint.raduis.toFixed(COOR_PRECIS);
	 }


	 /*
	  * Updates the Waypoint Path. This should be called after any change to the waypoint's position.
	  */
	 function updatePolyline() {
	 	//Grab the line
	 	var line = viewer.entities.getById('line');
	 	
	 	//Destroy it
	 	if(line != undefined) {
	 		viewer.entities.remove(line);
	 	}

	 	//Get list of waypoint data sorted by number
	 	var waypoints = getSortedPoints();

	 	//fill coordinate array
	 	var coordinates = [];
	 	waypoints.forEach(function f(point, i){
	 		coordinates.push(point.longitude);
	 		coordinates.push(point.latitude);
	 		coordinates.push(point.height);
	 	});

	 	//Add new line with new coordinates
	 	line = viewer.entities.add({
	 		name:"Waypoint Line",
	 		id:"line",
	 		polyline : {
	 			positions : Cesium.Cartesian3.fromDegreesArrayHeights(coordinates),
	 			width : 2,
	 			material : Cesium.Color.RED
	 		}
	 	}); 	
	 }


	 //loops throug entities and performs functions on waypoints
	 function loopWaypoints(f) {
	 	for(var i =0; i < viewer.entities.values.length; i++) {
	 		entity = viewer.entities.values[i];
	 		if(entity.type == 'waypoint'){
	 			f(entity);
	 		}
	 	}
	 }

	 //Clear the toolbar
	 function clearWaypointControls () {
		document.getElementById('WaypointNumber').value = "";
	 	document.getElementById('Command').value = "";
	 	document.getElementById('Latitude').value = "";
	 	document.getElementById('Longitude').value = "";
	 	document.getElementById('Altitude').value = "";
	 	document.getElementById('Radius').value = "";
	 }


	 /*
	  * Shifts waypoints in range a to b one left or one right depending on a - b
	  * @param start the start of the range
	  * @param stop the end of the range
	  */
	 function shiftPoints (start, stop) {

	 	loopWaypoints (function f(waypoint) { //Go through waypoints

	 		//Check if we're shifting forewards or backwards
	 		if(start - stop > 0) {
	 			if(waypoint.pointNumber > stop && waypoint.pointNumber <= start) {	//if between start and stop
	 				changeNumber(waypoint, waypoint.pointNumber - 1);	//shift
	 			}
	 		}
	 		else {
	 			if(waypoint.pointNumber >= start && waypoint.pointNumber < stop) { //if between start and stop
	 				changeNumber(waypoint, waypoint.pointNumber + 1);	//shift
	 			}
	 		}
	 	});
 	}

 	//change a point's number
	 function changeNumber(waypoint, newNumber) {
	 	waypoint.pointNumber = newNumber;
	 	waypoint.name = "Waypoint " + newNumber;
	 	waypoint.label.text = "Waypoint " + newNumber;
	 }