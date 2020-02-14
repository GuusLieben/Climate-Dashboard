# .Climate Dust
## Objective
This project was created as a modular data visualization for a personal weather station, hosted using the Raspberry 2B+ running custom Python scripts to measure climate data from several sensors, and writing data to a locally hosted MySQL database. The project displays the data in date-filtered graphs, with the possibility for the user to set the date range.

### Preview
![Preview](https://i.imgur.com/Ublpjzu.png)

## Setting up
_Note: The project uses a combination of Angular (CLI) 9.* and Node 12.*_

After cloning the project to your local file system ([Cloning Git projects](https://help.github.com/en/github/creating-cloning-and-archiving-repositories/cloning-a-repository)) run ```npm install``` to collect the required Node modules for the project.

The project can be started in several methods, the two recommended options are as follows.

### Development server
Run ```ng server``` for a dev server for the client logic. Navigate to ```http://localhost:4200/```.
Run ```npm run start``` for a dev server for the server logic. The API will be active at ```http://localhost:8080/api```.
The server dev server uses Express and defaults to port 8080, you can change this by modifying your Environment Variable PORT. The server has been set up to use CORS by default.

### Production server
Run ```npm run prod``` to build the Angular client, and host the built version using Express Static.
Depending on your use case, you can use utilities such as [Nexe](https://github.com/nexe/nexe) to compile the server into a single executable.

## Configuration
### Server
The configuration file for the server is located at `./settings.js`. If it does not yet exist, create it using the following format :
```js
module.exports = {
    connectionSettings: {
        host: '[MYSQL_HOST]',
        user: '[MYSQL_USER]',
        password: '[MYSQL_PASS]',
        database: '[MYSQL_DB]'
    },
    gatherAllQuery: 'SELECT \'Temperature\' AS TypeSet, Datum AS Recorded, Tijd, temp1 AS Measure1, temp2 AS Measure2, press, light, humi FROM temperatures UNION SELECT \'Particle\' AS TypeSet, recorded AS Recorded, 0, pm25 AS Measure1, pm10 AS Measure2, 0, 0, 0 FROM particles'
}
```

### Client
The configuration file for the client is located at `./src/app/datasettings.json`.
```json
{
    "theme": "dark1 | dark2 | light1 | light2 | custom",
    "themeSet": {
        "background": "red | #00ffff",
        "secondary-background": "blue | #ffff00",
        "action-background": "green | rgba(0,0,0,0.8)",
        "text": "white | rgb(255,255,255)"
    },
    "sourceLabels": true | false,
    "historyEnabled": true | false,
    "prettyDateTimeFormat": "DD MMM YYYY HH:mm",
    "sources": [
        {
            "id": "sample_",
            "label": "Sample Source",
            "url": "http://localhost:8080/api",
            "sourceDataFormat": {
                "date": "DD.MM.YYYY",
                "time": "HH:mm:ss"
            },
            "data": [
                {
                    "id": "sample",
                    "title": "Sample",
                    "label": "Sample (unit)",
                    "labelFormat": "0.00 Samples",
                    "location": "data.sample",
                    "chartType": "line | spline | area | splineArea | stackedArea | column | stackedColumn | bar | stackedBar | stackedBar100 | waterfall | scatter",
                    "formula": "(input - set0_curr) * (set1_curr - set1_next)",
                    "baseSet": 0,
                    "sets": [
                        {
                            "id": "sample1",
                            "label": "First Sample",
                            "color": "#ff0000",
                            "markerType": "circle",
                            "markerSize": 2,
                            "variables": [
                                [0, 5, 10, 15],
                                [1, 6, 11, 16]
                            ]
                        },
                        {
                            "id": "sample2",
                            "label": "Second Sample",
                            "color": "rgb(255,0,0)",
                            "markerType": "square",
                            "markerSize": 1,
                            "variables": [
                                [0, 10, 20, 30],
                                [10, 20, 30, 40]
                            ]
                        }
                    ]
                }
            ]
        }
    ]
}
```

#### Setting descriptions
- `themeSet`: Required when `theme` is set to "custom". Requires values `background`, `secondary-background`, `action-background`, `text`.  
- `historyEnabled`: Indicates whether or not the client will display active logging to the user.  
- `prettyDateTimeFormat`: The dateTime format used in all graphs, used by MomentJS to parse measurement date values to user friendly dates.  
- `sources.sourceDataFormat`: The date and time format used by the API (see API Structure).  
- `sources.data`: Each object here will be used to generate one graph. Id's must be unique.  
- `sources.data.labelFormat`: The format used in graph data visualization labels.  
- `sources.data.location`: The API dataset location, prepend with `data.`.  
- `sources.data.chartType`: Defines the type of chart used.  
- `sources.data.formula`: Optional formula to use over every value in the dataset. Use `input` as variable to use the current value (e.g. `(input / 100) + 10`)  
- `sources.data.sets.variables`: Variables to use in calculations. When present, compares the value _current_ and _next_ variables of the baseSet (default 0) (current < value < next) in the order of the array. Example _value=10_ with array value `[0, 5, 15, 25]` with formula `(input / set0_curr) + set0_next` will result in `(10 / 5) + 15`. Additional variables are not (yet) supported.  
- `sources.data.baseSet`: Indicates which of the `variables` arrays should be used, counted from zero (0). Defaults to 0.  
- `sources.data.sets.markerType`: Defaults to none  
- `sources.data.sets.markerSize`: Defaults to 8  

## API Structure
The incoming API is expected to be structured in the following manner :
```json
{
    "response": {
        "sources.sourceDataFormat": {
            "sources.data.location": [
                "sources.data.sets.id": "value"
            ]
        }
    }
}
```
