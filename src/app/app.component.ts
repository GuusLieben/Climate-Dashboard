import { Component, OnInit, AfterViewInit, ApplicationRef, NgZone } from '@angular/core'
import * as CanvasJS from '../assets/canvasjs.min'
import { HttpClient } from '@angular/common/http'
import * as moment from 'moment'
import { Moment } from 'moment'
import { NgbDateStruct, NgbCalendar } from '@ng-bootstrap/ng-bootstrap'

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit {

	// HttpClient for API calls, NgZone for out-of-zone activities
	constructor(private http: HttpClient, private zone: NgZone) { }

	// AQI calculation variables
	private pm25arr = [0, 12, 35.4, 55.4, 150.4, 250.4, 350.4, 500.4]
	private pm10arr = [0, 54, 154, 254, 354, 424, 504, 604]

	// Chart data
	private dataPoints: Array<Array<any>> = []
	public rendering: boolean = true
	private charts: Array<CanvasJS.Chart> = []

	// Progress/history store
	public progress: Array<any> = []

	// Active date filter, ='All' if either are null
	public selected: { start: string, end: string } = { start: null, end: null }

	// lastMillis will display when the previous task was started, to render how long a task took
	private lastMillis: number;

	// Date Struct is valid if neither are null, and date formats are valid (through MomentJS)
	structValid(): boolean {
		const firstStruct = this.selected.start ? moment(this.selected.start, 'YYYY-MM-DDTHH:mm:ss.mmmZ').valueOf() : null
		const lastStruct = this.selected.end ? moment(this.selected.end, 'YYYY-MM-DDTHH:mm:ss.mmmZ').valueOf() : null
		if (!firstStruct || !lastStruct) return false
		return firstStruct < lastStruct
	}

	// To prevent duplicate logic in the plural function for formatting
	formatStruct(struct: string) {
		return struct ? moment(struct, 'YYYY-MM-DDTHH:mm:ss.mmmZ').format('DD MMM YYYY') : null
	}

	formatStructs() {
		const fStr = this.formatStruct(this.selected.start)
		const lStr = this.formatStruct(this.selected.end)
		return (fStr && lStr) ? fStr + ' - ' + lStr : 'All'
	}

	// Using getter to more quickly hook into Angular activity rendering
	isRendering(): boolean {
		return this.rendering
	}

	pushUpdate(update: string) {
		const currentMillis = moment().milliseconds()
		let lastTook = (currentMillis - this.lastMillis)
		if (lastTook < 0) lastTook = -lastTook;

		// Run the logging inside Angular's zone, to directly push an update even if the update is called from outside Angular's zone
		this.zone.run(() => this.progress.push({
			new: update,
			lastTook: lastTook ? ` . . . took ${lastTook}ms` : ''
		}))
		this.lastMillis = currentMillis
	}

	async ngAfterViewInit() {
		// Run outside Angular's zone to prevent hanging the UI
		this.zone.runOutsideAngular(() => {
			this.pushUpdate('Connecting to API')
			this.http.get('http://localhost:8080/api').subscribe(async (data: any) => {
				this.pushUpdate('Received data from API');
				const sets = ['pm25', 'pm10', 'temperatureLow', 'temperatureHigh', 'pressure', 'lightLevel', 'humidity']
				const valueData = []
				this.pushUpdate('Registering data sets')
				sets.forEach(set => {
					this.pushUpdate(`=> ${set}`);
					this.registerDataPointSet(set)
					valueData[set] = { min: null, max: null }
				})

				this.pushUpdate('Adding markers for ' + Object.keys(data.response).length + ' registrations')
				Object.keys(data.response).forEach(date => {
					if (data.response[date].particles) {
						// AQI Markers require a calculation to be run over the collected values, after these calculations the addMarkers() function is called
						this.addAQIMarkers(data.response[date].particles, 'pm25', date, valueData['pm25'], 25)
						this.addAQIMarkers(data.response[date].particles, 'pm10', date, valueData['pm10'], 10)
					}

					if (data.response[date].sensors) {
						// Will convert collected data to graph readable formats, grouped by date
						this.addMarkers(data.response[date].sensors, 'temperatureLow', date, valueData['temperatureLow'])
						this.addMarkers(data.response[date].sensors, 'temperatureHigh', date, valueData['temperatureHigh'])
						this.addMarkers(data.response[date].sensors, 'pressure', date, valueData['pressure'])
						this.addMarkers(data.response[date].sensors, 'lightLevel', date, valueData['lightLevel'])
						this.addMarkers(data.response[date].sensors, 'humidity', date, valueData['humidity'])
					}
				})

				// Iterate datapoint sets
				this.pushUpdate('Calculating minimum and maximum values');
				sets.forEach(set => {
					this.pushUpdate(`=> '${set}'`)
					// Iterate values inside datapoint sets
					let maxSet = false
					let minSet = false
					for (let i = this.dataPoints.length - 1; i >= 0; i--) {
						// Single value inside a datapoint set
						// TODO : Re-use or split up marker code
						if (this.dataPoints[set][i].y === valueData[set]['max']) {
							this.dataPoints[set][i].markerType = 'cross'
							this.dataPoints[set][i].markerColor = 'cyan'
							maxSet = true
						}
						if (this.dataPoints[set][i].y === valueData[set]['min']) {
							this.dataPoints[set][i].markerType = 'cross'
							this.dataPoints[set][i].markerColor = 'cyan'
							minSet = true
						}
						if (maxSet === true && minSet === true) break
					}
				})

				this.pushUpdate(`Sorting all data sets`)
				// Sorts all given data sets (here, all) by date
				this.sortAllDataPointSets(sets)

				this.pushUpdate(`Generating charts`)
				this.charts['pm'] = this.generateChart(
					'pmChart',
					[{ label: '1.0 micrometer', data: this.dataPoints['pm10'], color: '#B483A4' },
					{ label: '2.5 micrometer', data: this.dataPoints['pm25'], color: '#696D80' }],
					'Particulate matter', 'Emission', '0.00 μm'
				)

				this.charts['temp'] = this.generateChart(
					'tempChart',
					[{ label: 'First measure', data: this.dataPoints['temperatureLow'], color: '#AC5838' },
					{ label: 'Second measure', data: this.dataPoints['temperatureHigh'], color: '#CCAC32' }],
					'Temperatures', 'Celcius (°C)', '0.00 °C'
				)

				this.charts['pressure'] = this.generateChart(
					'pressChart',
					[{ label: 'Pressure', data: this.dataPoints['pressure'], color: '#7180B9' }],
					'Pressure', 'Hectopascal (hPa)', '0 hPa'
				)

				this.charts['light'] = this.generateChart(
					'lightChart',
					[{ label: 'Lux', data: this.dataPoints['lightLevel'], color: '#6C6A4D' }],
					'Light Level', 'Lux', '0 lx'
				)

				this.charts['humi'] = this.generateChart(
					'humChart',
					[{ label: 'Percentage', data: this.dataPoints['humidity'], color: '#4F7566' }],
					'Humidity', 'Percentage', '0,00%'
				)
				this.pushUpdate(`Rendering all charts`)
				this.rendering = false

				this.renderChart([], 0, 'pm', 'temp', 'pressure', 'light', 'humi')
				this.pushUpdate(`Done.`)
			}, error => {
				console.log('Failed to get data')
			})
		})
	}

	resetFilter(chartId: string, ...dataPointIds: string[]) {
		for (let i = 0; i < dataPointIds.length; i++) {
			this.renderChart(this.dataPoints[dataPointIds[i]], i, chartId)
		}
	}

	resetAllFilters() {
		this.pushUpdate('Resetting filters')
		this.selected.end = null
		this.selected.start = null
		this.resetFilter('temp', 'temperatureLow', 'temperatureHigh')
		this.resetFilter('pm', 'pm10', 'pm25')
		this.resetFilter('pressure', 'pressure')
		this.resetFilter('light', 'lightLevel')
		this.resetFilter('humi', 'humidity')
		this.pushUpdate('Done filtering.')
	}

	applyDateFilter() {
		this.pushUpdate('Applying date filter')
		if (this.structValid()) {
			this.pushUpdate('=> Struct validated')
			const firstDate = this.selected.start
			const lastDate = this.selected.end

			this.filterChartByDate('temp', firstDate, lastDate, 'temperatureLow', 'temperatureHigh')
			this.filterChartByDate('pm', firstDate, lastDate, 'pm10', 'pm25')
			this.filterChartByDate('pressure', firstDate, lastDate, 'pressure')
			this.filterChartByDate('light', firstDate, lastDate, 'lightLevel')
			this.filterChartByDate('humi', firstDate, lastDate, 'humidity')
		} else {
			this.pushUpdate('=> Invalid Struct, discarding')
		}
		this.pushUpdate('Done filtering.')
	}

	filterChartByDate(chartId: string, startDate: string, endDate: string, ...dataPointIds: string[]) {
		const leftD = moment(startDate, 'YYYY-MM-DDTHH:mm:ss.mmmZ').valueOf()
		const rightD = moment(endDate, 'YYYY-MM-DDTHH:mm:ss.mmmZ').valueOf()

		for (let i = 0; i < dataPointIds.length; i++) {
			const data = this.dataPoints[dataPointIds[i]].filter((datapoint: any) => {
				const dpDate = moment(datapoint.label, 'DD MMM YYYY HH:mm').valueOf()
				return (dpDate >= leftD && dpDate <= rightD)
			})
			if (data.length === 0) data.push({ y: 0, label: 'No data in range' })
			this.pushUpdate(`=> Reduced ${chartId}.${dataPointIds[i]} to ${data.length} entries (was ${this.dataPoints[dataPointIds[i]].length})`)
			this.renderChart(data, i, chartId)
		}
	}

	renderChart(data: Array<any> = [], dataPointId: number, ...ids: string[]) {
		ids.forEach(id => {
			if (data.length > 0) this.charts[id].options.data[dataPointId].dataPoints = data
			this.charts[id].render()
		})
	}

	async ngOnInit() {
	}

	generateAverageBySet(data: Array<any>): Array<any> {
		this.pushUpdate(`Generating dataset averages with ${data.length} entries`)
		const totalByDay = []
		for (let i = 0; i < data.length; i++) {
			const date = moment(data[i].label, 'DD MMM YYYY HH:mm').dayOfYear();
			if (!totalByDay[date]) totalByDay[date] = { value: 0, amount: 0, day: data[i].label }
			totalByDay[date].value += data[i].y
			totalByDay[date].amount += 1;
		}
		const averageByDay = []
		for (let i = 0; i < totalByDay.length; i++) {
			if (totalByDay[i]) {
				averageByDay.push({
					y: totalByDay[i].value / totalByDay[i].amount,
					label: totalByDay[i].day,
					markerType: 'none'
				})
			}
		}
		return averageByDay;
	}

	generateChart(id: string, dataSets: Array<any>, title: string, labelY: string, formatY?: string): CanvasJS.Chart {
		const data = []
		dataSets.forEach(dataSet => {
			data.push({
				markerSize: 8,
				type: 'line',
				name: dataSet.label,
				showInLegend: true,
				dataPoints: dataSet.data,
				color: dataSet.color,
				yValueFormatString: formatY
			})
		})

		const chart = new CanvasJS.Chart(id, {
			animationEnabled: false,
			exportEnabled: true,
			zoomEnabled: true,
			theme: 'dark1',
			title: {
				text: title
			},
			legend: {
				cursor: 'pointer',
				verticalAlign: 'top',
				horizontalAlign: 'right',
				dockInsidePlotArea: false
			},
			axisX: {
				crosshair: {
					enabled: true,
					snapToDataPoint: true
				}
			},
			axisY: {
				title: labelY,
				includeZero: false
			},
			toolTip: {
				shared: true
			},
			data
		})
		return chart
	}

	calcAQI(input: number, pms: Array<number>) {
		const aqi = [0, 50, 100, 150, 200, 300, 400, 500]
		for (let i = 0; i < pms.length; i++)
			if (input >= pms[i] && input <= pms[i + 1])
				return ((aqi[i + 1] - aqi[i]) / (pms[i + 1] - pms[i])) * (input - pms[i]) + aqi[i]
	}

	addMarkers(sensors: Array<any>, value: string, date: string, valueData: any) {
		sensors.forEach(measure => {
			const dateFormat = moment(date + ' ' + measure.time, 'DD.MM.YYYY HH:mm:ss').format('DD MMM YYYY HH:mm')
			this.dataPoints[value].push({
				y: measure[value],
				label: dateFormat,
				markerType: 'none'
			})
			if (measure[value] > valueData.max || !valueData.max) valueData.max = measure[value]
			if (measure[value] < valueData.min || !valueData.min) valueData.min = measure[value]
		})
	}

	addAQIMarkers(sensors: Array<any>, value: string, date: string, valueData: any, pmType: number) {
		for (let i = 0; i < sensors.length; i++) {
			if (pmType === 10) sensors[i][value] = this.calcAQI(sensors[i][value], this.pm10arr)
			if (pmType === 25) sensors[i][value] = this.calcAQI(sensors[i][value], this.pm25arr)
		}
		this.addMarkers(sensors, value, date, valueData)
	}

	registerDataPointSet(...labels: string[]) {
		labels.forEach(label => {
			this.dataPoints[label] = []
		})
	}

	sortAllDataPointSets(sets: Array<string>) {
		this.pushUpdate(`Sorting ${sets.length} data sets`)
		sets.forEach(set => {
			this.pushUpdate(`=> ${set}`)
			this.dataPoints[set] = this.dataPoints[set].sort((left, right) => {
				const leftDate = moment(left.label, 'DD MMM YYYY HH:mm')
				const rightDate = moment(right.label, 'DD MMM YYYY HH:mm')
				const difference = leftDate.diff(rightDate)

				if (difference > 0) return 1
				else if (difference < 0) return -1
				else return 0
			})
		})
	}
}
