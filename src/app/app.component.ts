import { Component, OnInit, AfterViewInit, ApplicationRef, NgZone, HostBinding } from '@angular/core'
import * as CanvasJS from '../assets/canvasjs.min'
import { HttpClient } from '@angular/common/http'
import * as moment from 'moment'
import * as format from 'format-number-with-string'

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit {

	// Configuration file
	public settings = require('../assets/datasettings.json')

	// CSS Variables
	public cssThemeValues = {
		dark1: {
			background: '#2A2A2A',
			'secondary-background': '#3E3E3E',
			'action-background': '#333333',
			text: '#FFFFFF'
		},
		dark2: {
			background: '#32373A',
			'secondary-background': '#2f3335',
			'action-background': '#2a353b',
			text: '#FFFFFF'
		},
		light1: {
			background: '#FFFFFF',
			'secondary-background': '#E3E3E3',
			'action-background': '#CCCCCC',
			text: '#000000'
		},
		light2: {
			background: '#FFFFFF',
			'secondary-background': '#E3E3E3',
			'action-background': '#CCCCCC',
			text: '#000000'
		},
	}

	private themeName: string = 'light1'

	// HttpClient for API calls, NgZone for out-of-zone activities
	constructor(private http: HttpClient, private zone: NgZone) {
		let themeSet: { background: string, 'secondary-background': string, 'action-background': string, text: string };

		if (this.settings.theme === 'custom') themeSet = this.settings.themeSet
		else if (this.cssThemeValues[this.settings.theme]) {
			themeSet = this.cssThemeValues[this.settings.theme]
			this.themeName = this.settings.theme
		}
		else themeSet = this.cssThemeValues['light1']

		Object.keys(themeSet).forEach(reg => document.documentElement.style.setProperty(`--${reg}`, themeSet[reg]))

		document.documentElement.style.setProperty('--banner-url', `url(${this.settings.bannerUrl})`)

		this.settings.sources.forEach(source => source.data.forEach(data => data.sets.forEach(set => this.setIds.push({
			id: set.id,
			name: set.label,
			color: set.color,
			format: data.labelFormat
		}))))
	}

	// Custom calculation variables
	private math = require('mathjs')

	// Copyright variable
	public year = moment().year()

	// Chart data
	public dataPoints: Array<Array<any>> = []
	public rendering: boolean = true
	private charts: Array<CanvasJS.Chart> = []
	public setIds: any[] = []

	// Progress/history store
	public progress: Array<any> = []
	public showHistory: boolean = true
	public historyEnabled = this.settings.historyEnabled

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

	private latestValues: any[] = []

	latestValue(set: any) {
		if (this.latestValues[set.id]) return this.latestValues[set.id]
		else if (this.dataPoints[set.id] && this.dataPoints[set.id].length > 0) {
			const item = this.dataPoints[set.id][this.dataPoints[set.id].length-1]
			item.y = format(item.y, set.format)
			this.latestValues[set.id] = item
			return item
		}
		return {label: 'No measurement', y: '', color: 'gray'}
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
			this.settings.sources.forEach(source => {
				const sourceIndex = this.settings.sources.indexOf(source)
				this.pushUpdate(`Connecting to ${source.label}`)

				this.http.get(source.url).subscribe(async (apiResponse: any) => {
					this.pushUpdate('Received data from API')
					this.pushUpdate('Registering data sets')

					source.data.filter((datapoint: any) => datapoint.location).forEach((dataRegistration: any) => {
						const valueData: Array<any> = []
						const setIds: Array<string> = Array.from(dataRegistration.sets, (set: any) => set.id)
						dataRegistration.sets.forEach((dataSet: any) => {
							this.pushUpdate(`=> ${dataRegistration.id}.${dataSet.id}`)
							this.registerDataPointSet(dataSet.id)
							valueData[dataSet.id] = { min: null, max: null }
						})

						this.pushUpdate('Adding markers for ' + Object.keys(apiResponse.response).length + ' registrations')
						Object.keys(apiResponse.response).forEach(date => {
							dataRegistration.sets.forEach((dataSet: { id: string, label: string, color: string, formula?: string, variables?: number[][], baseSet?: number, markerType?: string }) => {
								if (apiResponse.response[date][dataRegistration.location.substring(5)]) {
									if (dataRegistration.formula)
										this.addFormulaMarkers(apiResponse.response[date][dataRegistration.location.substring(5)], dataSet.id, date, dataRegistration.formula, valueData[dataSet.id], dataSet.variables ?? [], dataSet.baseSet ?? 0, source.sourceDataFormat, dataSet.markerType)
									else
										this.addMarkers(apiResponse.response[date][dataRegistration.location.substring(5)], dataSet.id, date, valueData[dataSet.id], source.sourceDataFormat, dataSet.markerType)
								}
							})
						})

						// Iterate datapoint sets
						this.pushUpdate(`Calculating minimum and maximum values for ${dataRegistration.id}`)
						this.minMaxForSet(setIds, valueData)

						this.pushUpdate(`Sorting all data sets for ${dataRegistration.id}`)
						// Sorts all given data sets (here, all) by date
						this.sortAllDataPointSets(setIds)

						this.pushUpdate(`Generating chart '${dataRegistration.id}' with title '${dataRegistration.title}'`)
						const chartDataPoints = Array.from(dataRegistration.sets, (dataSet: { id: string, label: string, color: string, type?: number, markerSize?: number }) => {
							return {
								label: dataSet.label,
								data: this.dataPoints[dataSet.id],
								color: dataSet.color,
								markerSize: dataSet.markerSize
							}
						})

						this.charts[source.id + dataRegistration.id] = this.generateChart(
							`${source.id}${dataRegistration.id}Chart`,
							chartDataPoints,
							dataRegistration.title,
							dataRegistration.label,
							dataRegistration.chartType ?? 'splineArea',
							dataRegistration.labelFormat)

						this.pushUpdate(`Rendering all charts for ${dataRegistration.id}`)
						this.renderChart([], 0, source.id + dataRegistration.id)

						if (sourceIndex === this.settings.sources.length - 1) {
							this.rendering = false
							this.showHistory = false

							this.pushUpdate(`Done.`)
						}
					})
				}, error => {
					console.error('An unknown error occurred : ', JSON.stringify(error))
				})
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
		this.settings.sources.forEach(source => {
			source.data.forEach(datapoint => {
				const setIds: Array<string> = Array.from(datapoint.sets, (set: any) => set.id)
				this.resetFilter(source.id + datapoint.id, ...setIds)
			})
		})
		this.pushUpdate('Done filtering.')
	}

	applyDateFilter() {
		if (this.structValid()) {
			this.pushUpdate('Applying date filter')
			this.pushUpdate('=> Struct validated')
			const firstDate = this.selected.start
			const lastDate = this.selected.end

			this.settings.sources.forEach(source => {
				source.data.forEach(datapoint => {
					const setIds: Array<string> = Array.from(datapoint.sets, (set: any) => set.id)
					this.filterChartByDate(source.id + datapoint.id, firstDate, lastDate, ...setIds)
				})
			})
			this.pushUpdate('Done filtering.')
		}
	}

	filterChartByDate(chartId: string, startDate: string, endDate: string, ...dataPointIds: string[]) {
		const leftD = moment(startDate, 'YYYY-MM-DDTHH:mm:ss.mmmZ').valueOf()
		const rightD = moment(endDate, 'YYYY-MM-DDTHH:mm:ss.mmmZ').valueOf()

		for (let i = 0; i < dataPointIds.length; i++) {
			const data = this.dataPoints[dataPointIds[i]].filter((datapoint: any) => {
				const dpDate = moment(datapoint.label, this.settings.prettyDateTimeFormat).valueOf()
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
			const date = moment(data[i].label, this.settings.prettyDateTimeFormat).dayOfYear()
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

	generateChart(id: string, dataSets: Array<any>, title: string, labelY: string, chartType: string, formatY?: string): CanvasJS.Chart {
		const data = []
		dataSets.forEach(dataSet => {
			data.push({
				markerSize: dataSet.markerSize ?? 8,
				type: chartType,
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
			theme: this.themeName,
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
		if (variableSets.length > 0) {
			for (let i = 0; i < variableSets[baseSet].length; i++)
				if (input >= variableSets[baseSet][i] && input <= variableSets[baseSet][i + 1]) {
					let scope = this.createScope(variableSets, i)
					scope.input = input
					return this.math.evaluate(formula, scope)
				}
		} else {
			const scope = { input }
			return this.math.evaluate(formula, scope)
		}
	}

	addMarkers(dataSet: Array<any>, value: string, date: string, valueData: any, dataFormat: any, markerType?: string) {
		dataSet.forEach(measure => {
			const dateFormat = moment(date + ' ' + measure.time, `${dataFormat.date} ${dataFormat.time}`).format(this.settings.prettyDateTimeFormat)
			this.dataPoints[value].push({
				y: measure[value] ?? 0,
				label: dateFormat,
				markerType: markerType ?? 'none'
			})
			if (measure[value] > valueData.max || !valueData.max) valueData.max = measure[value]
			if (measure[value] < valueData.min || !valueData.min) valueData.min = measure[value]
		})
	}

	addFormulaMarkers(sensors: Array<any>, value: string, date: string, formula: string, valueData: any, variables: number[][], baseSet: number, dataFormat: any, markerType?: string) {
		for (let i = 0; i < sensors.length; i++)
			sensors[i][value] = this.evalFormula(formula, sensors[i][value], variables, baseSet)
		this.addMarkers(sensors, value, date, valueData, dataFormat, markerType)
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
				const leftDate = moment(left.label, this.settings.prettyDateTimeFormat)
				const rightDate = moment(right.label, this.settings.prettyDateTimeFormat)
				const difference = leftDate.diff(rightDate)

				if (difference > 0) return 1
				else if (difference < 0) return -1
				else return 0
			})
		})
	}
}
