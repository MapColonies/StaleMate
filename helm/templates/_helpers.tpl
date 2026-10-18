{{/*
Expand the name of the chart.
*/}}
{{- define "stalemate.name" -}}
{{- default .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
