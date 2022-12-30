const express = require("express");
const { pool } = require("mssql");
const axios = require("axios");
var cors = require("cors");
var bodyParser = require("body-parser");

const app = express();
const port = 3000;
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// connect to mysql
var mysql = require("mysql");

// config for your database
var connection = mysql.createConnection({
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  server: process.env.MYSQL_SERVER,
  port: process.env.MYSQL_PORT,
  database: process.env.MYSQL_DB,
});

connection.connect(function (error) {
  if (!!error) {
    console.log("Error");
  } else {
    console.log("Connected");
  }
});

//connect to traccar
var details = {
  email: process.env.TRACCAR_USER,
  password: process.env.TRACCAR_PASSWORD,
};

// Details for creating session
var formBody = [];

for (var property in details) {
  var encodedKey = encodeURIComponent(property);
  var encodedValue = encodeURIComponent(details[property]);
  formBody.push(encodedKey + "=" + encodedValue);
}
formBody = formBody.join("&");

let axiosConfig = {
  headers: {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
  },
};

let cookie;

axios
  .post("https://traccar.powunity.com/api/session", formBody, axiosConfig)
  .then((res) => {
    console.log("RESPONSE RECEIVED: ", res.headers["set-cookie"]);
    cookie = res.headers["set-cookie"];
  })
  .catch((err) => {
    console.log("AXIOS ERROR: ", err);
  });

// console.log(token);

app.get("/riders", (req, res) => {
  connection.query(
    "select Riders.*, RiderTypes.description as privilege from Riders inner join RiderTypes on Riders.type=RiderTypes.id",
    function (error, rows, fields) {
      if (!!error) {
        console.log("Error in query");
      } else {
        console.log("Successful query ");
        res.json(rows);
      }
    }
  );
});

// get list of riders
app.get("/riderID", (req, res) => {
  connection.query(
    "select id from Riders where username=?",
    [req.query.username],
    function (error, rows, fields) {
      if (!!error) {
        console.log("Error in query");
      } else {
        console.log("Successful query ");

        res.json(rows);
      }
    }
  );
});

// -- Home Page reports -----

// get a list of bikes
app.get("/bikes", (req, res) => {
  axios
    .get("https://traccar.powunity.com/api/positions", {
      headers: {
        Cookie: cookie,
      },
    })
    .then((res2) => {
      query =
        "select Bikes.*, Riders.fullname, Riders.phoneNumber, Rounds.roundName, Rounds.activeStop," +
        " Rounds.numOfStops, BikeStatus.description as statusDesc, COALESCE(faultCount.numOfFaults, 0) as numOfFaults from Bikes left join Riders on " +
        "Bikes.riderID = Riders.id left join Rounds on Riders.activeRoundID = Rounds.id " +
        "inner join BikeStatus on Bikes.Status = BikeStatus.id" +
        " left join (select bikeID, count(*) as numOfFaults from Faults where fixed = False group by bikeID)" +
        " as faultCount on Bikes.id = faultCount.bikeID order by Riders.fullname desc;";
      connection.query(query, function (error, rows, fields) {
        if (!!error) {
          console.log("Error in query");
          console.log(error);
        } else {
          var index = {};
          for (var j in rows) {
            var obj = rows[j];
            index[obj.traccarId] = obj;
          }
          let result = [];
          for (var i in res2.data) {
            var firstObj = res2.data[i];
            var match = index[firstObj.deviceId];
            if (match) {
              firstObj["bikeID"] = index[firstObj.deviceId]["id"];
              firstObj["name"] = index[firstObj.deviceId]["bikeName"];
              firstObj["fullname"] = index[firstObj.deviceId]["fullname"];
              firstObj["status"] = index[firstObj.deviceId]["statusDesc"];
              firstObj["phoneNumber"] = index[firstObj.deviceId]["phoneNumber"];
              firstObj["roundName"] = index[firstObj.deviceId]["roundName"];
              firstObj["activeStop"] = index[firstObj.deviceId]["activeStop"];
              firstObj["numOfStops"] = index[firstObj.deviceId]["numOfStops"];
              firstObj["numOfFaults"] = index[firstObj.deviceId]["numOfFaults"];
              result.push(firstObj);
            }
          }
          res.json(result);
        }
      });
    })
    .catch((err) => {
      console.log("AXIOS ERROR: ", err);
    });
});

// --- Reports ---------

app.get("/getFaults", (req, res) => {
  query =
    "select Faults.*, Bikes.bikeName, Riders.fullname, FaultTypes.description as faultDesc, Causes.description as causeDesc from Faults   inner join  Bikes on Bikes.id = Faults.bikeID inner join " +
    "Riders on Faults.riderID = Riders.id inner join FaultTypes on FaultTypes.id = Faults.faultType inner join Causes on Causes.id = Faults.cause order by Faults.fixed asc";
  connection.query(query, function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
      console.log(error);
    } else {
      res.status(200);

      res.json(rows);
    }
  });
});

// ------- Rounds Page ---------

// get all rounds for a Rider on app
app.get("/getRounds", (req, res) => {
  if (req.query.riderID) {
    connection.query(
      "select * from Rounds where completed = 0 and riderID=?",
      [req.query.riderID],
      function (error, rows, fields) {
        if (!!error) {
          console.log("Error in query");
          console.log(error);
        } else {
          console.log("Successful query ");
          res.json(rows);
        }
      }
    );
  } else {
    connection.query(
      "select Rounds.*, Riders.fullname, Bikes.bikeName, RoundStatus.description from Rounds inner join Riders on Rounds.riderID = Riders.id left join Bikes on Rounds.bikeID = Bikes.id inner join RoundStatus on Rounds.status = RoundStatus.id",
      function (error, rows, fields) {
        if (!!error) {
          console.log("Error in query");
        } else {
          console.log("Successful query ");
          res.status(200);

          res.json(rows);
        }
      }
    );
  }
});

// get a riders stops given routeid
app.get("/getStops", (req, res) => {
  query =
    "select Stops.*, DeliveryStatus.description from Stops inner join DeliveryStatus on Stops.deliveryStatus = DeliveryStatus.id where Stops.roundID=? order by Stops.stopNo asc";
  connection.query(query, [req.query.roundID], function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
    } else {
      console.log("Successful query ");
      res.json(rows);
    }
  });
});

//

// -------- RIDER ADMIN -----------

// get a riders stops given routeid
app.get("/addUser", (req, res) => {
  console.log(req.query.username);
  var query = "INSERT INTO Riders (username, fullname, phoneNumber) VALUES (?)";
  var values = [[req.query.username, req.query.fullname, req.query.number]];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      if (error.errno == 1062) {
        console.log("Duplicate");
        res.status(409);
        res.send("duplciate");
      } else {
        console.log("Other error");
        res.send("OTher error");
      }
      // res.json("Error");
    } else {
      console.log("Successful query ");
      console.log(rows);
      res.status(200);

      res.json(rows);
    }
  });
});

// get a riders stops given routeid
app.get("/updateUser", (req, res) => {
  console.log(req.query.username);
  var query =
    "UPDATE Riders SET username = ? ,fullName = ?, phoneNumber = ? where id= ? ";
  var values = [
    [req.query.username],
    [req.query.fullname],
    [req.query.number],
    [req.query.id],
  ];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      if (error.errno == 1062) {
        console.log("Duplicate");
        res.status(409);
        res.send("duplciate");
      } else {
        console.log("Other error");
        console.log(error);
        res.send("OTher error");
      }
      // res.json("Error");
    } else {
      console.log("Successful query ");
      res.status(200);

      res.json(rows);
    }
  });
});

// -------- Bike ADMIN -----------

// Get bike info known to the admin portal (Not traccar)
app.get("/bikesAdmin", (req, res) => {
  connection.query(
    "select Bikes.*, BikeStatus.description as status from Bikes inner join BikeStatus on Bikes.status= BikeStatus.id order by bikes.bikename asc ",
    function (error, rows, fields) {
      if (!!error) {
        console.log("Error in query");
      } else {
        console.log("Successful query ");
        res.json(rows);
      }
    }
  );
});

// get a riders stops given routeid
app.get("/addBike", (req, res) => {
  var query = "INSERT INTO Bikes (bikeName, traccarId) VALUES (?)";
  var values = [[req.query.name, req.query.traccarID]];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      if (error.errno == 1062) {
        res.status(409);
      } else {
        console.log(error);
        res.send("Other error");
      }
      // res.json("Error");
    } else {
      console.log("Successful query ");
      res.status(200);

      res.json(rows);
    }
  });
});

// get a riders stops given routeid
app.get("/updateBike", (req, res) => {
  console.log(req.query.username);
  var query = "UPDATE Bikes SET bikeName = ? ,traccarId = ?, where id= ? ";
  var values = [[req.query.bikeName], [req.query.traccarID], [req.query.id]];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      if (error.errno == 1062) {
        console.log("Duplicate");
        res.status(409);
        res.send("duplciate");
      } else {
        console.log("Other error");
        console.log(error);
        res.send("OTher error");
      }
      // res.json("Error");
    } else {
      console.log("Successful query ");
      res.status(200);

      res.json(rows);
    }
  });
});

// --------- App Select Rounds ------------------

// get free bikes
app.get("/freeBikes", (req, res) => {
  connection.query(
    "select * from Bikes where riderID is null and status!=2",
    function (error, rows, fields) {
      if (!!error) {
        console.log("Error in query");
        console.log(error);
      } else {
        console.log("Successful query ");
        res.json(rows);
      }
    }
  );
});

// get free bikes
app.get("/bikeStatus", (req, res) => {
  connection.query("select * from BikeStatus", function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
      console.log(error);
    } else {
      console.log("Successful query ");

      res.json(rows);
    }
  });
});

app.get("/startRound", (req, res) => {
  var query = "UPDATE Bikes SET riderID = ? ,status = ? where id= ? ";
  var values = [[req.query.riderID], [req.query.condition], [req.query.bikeID]];
  console.log("biek " + req.query.bikeID);
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error");
      console.log(error);
      res.send("Error");
    } else {
      console.log("Successful query 1");
    }
  });

  var query = "UPDATE Rounds SET bikeID = ? where id = ?";
  var values = [[req.query.bikeID], [req.query.roundID]];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error");
      console.log(error);
      res.send("Error");
    } else {
      console.log("Successful query 2");
    }
  });

  var query = "UPDATE Riders SET activeRoundID = ? where id = ?";
  var values = [[req.query.roundID], [req.query.riderID]];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error");
      console.log(error);
      res.send("Error");
    } else {
      console.log("Successful query 3");
    }
  });
  res.status(200);
  res.json("Table updated");
});

app.get("/endRound", (req, res) => {
  var query = "UPDATE Bikes SET riderID = null ,status = ? where id= ? ";
  var values = [[req.query.riderID], [req.query.condition], [req.query.bikeID]];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error");
      console.log(error);
      res.send("Error");
    } else {
      console.log("Successful query 1");
    }
  });

  var query = "UPDATE Rounds SET bikeID = ?, completed = 1 where id = ?";
  var values = [[req.query.bikeID], [req.query.roundID]];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log(error);
      res.send("Error");
    } else {
      console.log("Successful query 2");
    }
  });

  var query = "UPDATE Riders SET activeRoundID = null where id = ?";
  var values = [[req.query.roundID], [req.query.riderID]];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error");
      console.log(error);
      res.send("Error");
    } else {
      console.log("Successful query 3");
    }
  });
  res.status(200);
  res.json("Table updated");
});

// get roundInfo
app.get("/getRound", (req, res) => {
  connection.query(
    "select Stops.*, DeliveryStatus.description from Stops left join DeliveryStatus on DeliveryStatus.id = Stops.deliveryStatus where Stops.roundID = ?",
    [req.query.id],
    function (error, rows, fields) {
      if (!!error) {
        console.log("Error in query");
        console.log(error);
      } else {
        console.log("Successful query ");

        res.json(rows);
      }
    }
  );
});

// get roundInfo
app.get("/updateStop", (req, res) => {
  var query = "UPDATE Stops SET deliveryStatus = ? where id = ?";
  var values = [[req.query.status], [req.query.id]];
  console.log(req.query.id);
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
      console.log(error);
    } else {
      console.log("Successful query ");
      res.json(rows);
    }
  });
});

// get location of Rider
app.get("/getLocation", (req, res) => {
  connection.query(
    "select * from Bikes where id = ?",
    [req.query.id],
    function (error, rows, fields) {
      if (!!error) {
        console.log("Error in query");
        console.log(error);
      } else {
        console.log("Successful query ");

        res.json(rows);
      }
    }
  );
});

// ---------- App report page --------

// get faults
app.get("/getFaultTypes", (req, res) => {
  connection.query("select * from FaultTypes", function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
      console.log(error);
    } else {
      res.json(rows);
    }
  });
});

// get causes
app.get("/getCauses", (req, res) => {
  connection.query("select * from Causes", function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
    } else {
      res.json(rows);
    }
  });
});

// add report
app.get("/addFault", (req, res) => {
  var query =
    "insert into `Faults` (faultType, cause, bikeID, riderID, comment) values ( ? , ? , ? , ? , ? )";
  var values = [
    [req.query.type],
    [req.query.cause],
    [req.query.bikeID],
    [req.query.riderID],
    [req.query.roundID],
    [req.query.comment],
  ];
  console.log(req.query.type);
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
    } else {
      console.log("Successful query ");

      res.json(rows);
    }
  });
});

// ----------- Extra API Functions for adding rounds and stops -------

// add Round
app.get("/addRound", (req, res) => {
  var query =
    "insert into `Rounds` (roundName, RoundDate, riderID, numOfStops) values ( ? , ? , ? , ?  )";
  var values = [
    [req.query.name],
    [req.query.date],
    [req.query.riderID],
    [req.query.numOfStops],
  ];
  console.log(req.query.type);
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
    } else {
      console.log("Successful query ");
      res.json(rows);
    }
  });
});

// add Stop, this will updated to include bulk adding to add stops in one request
app.post("/addStops", (req, res) => {
  console.log("here " + req.body);
  var query =
    "insert into `Stops` (roundID, firstline, secondLine, city, postcode, latitude, longitude, stopNo, parcelID, clientName) values ?";
  var values = [req.body.stops];
  console.log(values);
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
      console.log(error);
    } else {
      console.log("Successful query ");
      console.log(error);
      console.log(rows);
      res.json(rows);
    }
  });
});

// update round details
app.get("/updateRound", (req, res) => {
  var query = "UPDATE Stops SET deliveryStatus = ? where id = ?";
  var query =
    "UPDATE  `Rounds` set roundName =?, RoundDate=?, riderID=?, numOfStops=? where id = ?";
  var values = [
    [req.query.name],
    [req.query.date],
    [req.query.riderID],
    [req.query.numOfStops],
    [req.query.roundID],
  ];
  console.log(req.query.type);
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
      console.log(error);
    } else {
      console.log("Successful query ");
      res.json(rows);
    }
  });
});

// add Stop, this will updated to include bulk adding to add stops in one request
app.post("/addStops", (req, res) => {
  var query =
    "update `Stops` set roundID=?, firstline=?, secondLine=?, city=?, postcode=?, latitude=?, longitude=?, stopNo=?, parcelID=?, clientName=? where roundID = ? and stopNo = ?";
  var values = [
    [req.query.roundID],
    [req.query.firstline],
    [req.query.secondLine],
    [req.query.city],
    [req.query.postcode],
    [req.query.latitude],
    [req.query.longitude],
    [req.query.stopNo],
    [req.query.parcelID],
    [req.query.clientName],
    [req.query.roundID],
    [req.query.stopID],
  ];
  connection.query(query, values, function (error, rows, fields) {
    if (!!error) {
      console.log("Error in query");
      console.log(error);
    } else {
      console.log("Successful query ");
      console.log(error);
      console.log(rows);
      res.json(rows);
    }
  });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
