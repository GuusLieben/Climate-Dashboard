import { Component, OnInit, AfterViewInit, ApplicationRef, NgZone } from '@angular/core'
import * as CanvasJS from '../assets/canvasjs.min'
import { HttpClient } from '@angular/common/http'
import * as moment from 'moment'
// import * as parser from 'math-expression-evaluator'

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit {

	public dataJSON = require('../assets/datasettings.json')

	// HttpClient for API calls, NgZone for out-of-zone activities
	constructor(private http: HttpClient, private zone: NgZone) { }

	// Custom calculation variables
	private math = require('mathjs')

	// Copyright variable
	public year = moment().year()

	// Chart data
	private dataPoints: Array<Array<any>> = []
	public rendering: boolean = true
	private charts: Array<CanvasJS.Chart> = []

	// Progress/history store
	public progress: Array<any> = []
	public showHistory: boolean = true
	public historyEnabled = this.dataJSON.historyEnabled

	// Active date filter, ='All' if either are null
	public selected: { start: string, end: string } = { start: null, end: null }

	// lastMillis will display when the previous task was started, to render how long a task took
	private lastMillis: number

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
		if (lastTook < 0) lastTook = -lastTook

		// Run the logging inside Angular's zone, to directly push an update even if the update is called from outside Angular's zone
		this.zone.run(() => this.progress.push({
			new: update,
			lastTook: lastTook ? ` . . . took ${lastTook}ms` : ''
		}))
		this.lastMillis = currentMillis
	}

	registerCustomMarker(set: string, i: number, type: string, color: string) {
		this.dataPoints[set][i].markerType = type
		this.dataPoints[set][i].markerColor = color
	}

	minMaxForSet(sets: string[], valueData: Array<any>) {
		sets.forEach(set => {
			this.pushUpdate(`=> '${set}'`)
			// Iterate values inside datapoint sets
			let maxSet = false
			let minSet = false
			for (let i = this.dataPoints[set].length - 1; i >= 0; i--) {
				// Single value inside a datapoint set
				if (this.dataPoints[set][i].y === valueData[set]['max'] && !maxSet) {
					this.registerCustomMarker(set, i, 'cross', 'pink')
					maxSet = true
				}
				if (this.dataPoints[set][i].y === valueData[set]['min'] && !minSet) {
					this.registerCustomMarker(set, i, 'cross', 'white')
					minSet = true
				}
				if (maxSet === true && minSet === true) break
			}
		})
	}

	async ngAfterViewInit() {
		// Run outside Angular's zone to prevent hanging the UI
		this.zone.runOutsideAngular(() => {
			this.pushUpdate('Connecting to API')
			this.http.get(this.dataJSON.url).subscribe(async (data: any) => {
				this.pushUpdate('Received data from API')
				this.pushUpdate('Registering data sets')

				this.dataJSON.data.filter((datapoint: any) => datapoint.location).forEach((datapoint: any) => {
					const valueData: Array<any> = []
					const setIds: Array<string> = Array.from(datapoint.sets, (set: any) => set.id)
					datapoint.sets.forEach((dataSet: any) => {
						this.pushUpdate(`=> ${datapoint.id}.${dataSet.id}`)
						this.registerDataPointSet(dataSet.id)
						valueData[dataSet.id] = { min: null, max: null }
					})

					this.pushUpdate('Adding markers for ' + Object.keys(data.response).length + ' registrations')
					Object.keys(data.response).forEach(date => {
						datapoint.sets.forEach((dataSet: { id: string, label: string, color: string, formula?: string, variables?: number[][], baseSet?: number }) => {
							if (data.response[date][datapoint.location.substring(5)]) {
								if (datapoint.formula)
									this.addFormulaMarkers(data.response[date].particles, dataSet.id, date, datapoint.formula, valueData[dataSet.id], dataSet.variables ?? [], dataSet.baseSet ?? 0)
								else
									this.addMarkers(data.response[date].sensors, dataSet.id, date, valueData[dataSet.id])
							}
						})
					})

					// Iterate datapoint sets
					this.pushUpdate(`Calculating minimum and maximum values for ${datapoint.id}`)
					this.minMaxForSet(setIds, valueData)

					this.pushUpdate(`Sorting all data sets for ${datapoint.id}`)
					// Sorts all given data sets (here, all) by date
					this.sortAllDataPointSets(setIds)

					this.pushUpdate(`Generating chart '${datapoint.id}' with title '${datapoint.title}'`)
					const chartDataPoints = Array.from(datapoint.sets, (dataSet: { id: string, label: string, color: string, type?: number }) => {
						return {
							label: dataSet.label,
							data: this.dataPoints[dataSet.id],
							color: dataSet.color
						}
					})

					this.charts[datapoint.id] = this.generateChart(
						`${datapoint.id}Chart`,
						chartDataPoints,
						datapoint.title,
						datapoint.label,
						datapoint.labelFormat)

					this.pushUpdate(`Rendering all charts for ${datapoint.id}`)
					this.renderChart([], 0, datapoint.id)

				})

				this.rendering = false
				this.showHistory = false

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
		this.dataJSON.forEach(datapoint => {
			const setIds: Array<string> = Array.from(datapoint.sets, (set: any) => set.id)
			this.resetFilter(datapoint.id, ...setIds)
		})
		this.pushUpdate('Done filtering.')
	}

	applyDateFilter() {
		if (this.structValid()) {
			this.pushUpdate('Applying date filter')
			this.pushUpdate('=> Struct validated')
			const firstDate = this.selected.start
			const lastDate = this.selected.end

			this.dataJSON.forEach(datapoint => {
				const setIds: Array<string> = Array.from(datapoint.sets, (set: any) => set.id)
				this.filterChartByDate(datapoint.id, firstDate, lastDate, ...setIds)
			})
			this.pushUpdate('Done filtering.')
		}
	}

	filterChartByDate(chartId: string, startDate: string, endDate: string, ...dataPointIds: string[]) {
		const leftD = moment(startDate, 'YYYY-MM-DDTHH:mm:ss.mmmZ').valueOf()
		const rightD = moment(endDate, 'YYYY-MM-DDTHH:mm:ss.mmmZ').valueOf()

		for (let i = 0; i < dataPointIds.length; i++) {
			const data = this.dataPoints[dataPointIds[i]].filter((datapoint: any) => {
				const dpDate = moment(datapoint.label, this.dataJSON.prettyDateTimeFormat).valueOf()
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
			const date = moment(data[i].label, this.dataJSON.prettyDateTimeFormat).dayOfYear()
			if (!totalByDay[date]) totalByDay[date] = { value: 0, amount: 0, day: data[i].label }
			totalByDay[date].value += data[i].y
			totalByDay[date].amount += 1
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
		return averageByDay
	}

	generateChart(id: string, dataSets: Array<any>, title: string, labelY: string, formatY?: string): CanvasJS.Chart {
		const data = []
		dataSets.forEach(dataSet => {
			data.push({
				markerSize: 8,
				type: 'splineArea',
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

	createScope(variableSets: number[][], index: number): any {
		let scope = {}
		const length = variableSets[0].length
		for (let i = 0; i < variableSets.length; i++) {
			if (variableSets[i].length != length) console.error(`Variable set ${i} does not have the same length as set 0 (${length}). This might cause unexpected behavior!`)
			scope[`set${i}_curr`] = variableSets[i][index]
			scope[`set${i}_next`] = variableSets[i][index + 1]
		}
		return scope
	}

	evalFormula(formula: string, input: number, variableSets: number[][], baseSet: number) {
		for (let i = 0; i < variableSets[baseSet].length; i++)
			if (input >= variableSets[baseSet][i] && input <= variableSets[baseSet][i + 1]) {
				let scope = this.createScope(variableSets, i)
				scope.input = input
				return this.math.evaluate(formula, scope)
			}
	}

	addMarkers(sensors: Array<any>, value: string, date: string, valueData: any) {
		sensors.forEach(measure => {
			const dateFormat = moment(date + ' ' + measure.time, `${this.dataJSON.dataFormat.date} ${this.dataJSON.dataFormat.time}`).format(this.dataJSON.prettyDateTimeFormat)
			this.dataPoints[value].push({
				y: measure[value] ?? 0,
				label: dateFormat,
				markerType: 'none'
			})
			if (measure[value] > valueData.max || !valueData.max) valueData.max = measure[value]
			if (measure[value] < valueData.min || !valueData.min) valueData.min = measure[value]
		})
	}

	addFormulaMarkers(sensors: Array<any>, value: string, date: string, formula: string, valueData: any, variables: number[][], baseSet: number) {
		for (let i = 0; i < sensors.length; i++)
			sensors[i][value] = this.evalFormula(formula, sensors[i][value], variables, baseSet)
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
				const leftDate = moment(left.label, this.dataJSON.prettyDateTimeFormat)
				const rightDate = moment(right.label, this.dataJSON.prettyDateTimeFormat)
				const difference = leftDate.diff(rightDate)

				if (difference > 0) return 1
				else if (difference < 0) return -1
				else return 0
			})
		})
	}
}
