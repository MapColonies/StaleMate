{{/*
Expand the name of the chart.
*/}}
{{- define "stalemate-api.name" -}}
{{- default .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "stalemate-api.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "stalemate-api.labels" -}}
helm.sh/chart: {{ include "stalemate-api.chart" . }}
{{ include "stalemate-api.selectorLabels" . }}
{{- if .Chart.Version }}
app.kubernetes.io/version: {{ .Chart.Version | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{ include "mclabels.labels" . }}
{{- end }}

{{/*
Returns the tag of the chart.
*/}}
{{- define "stalemate-api.tag" -}}
{{- default (printf "v%s" .Chart.Version) .Values.image.tag }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "stalemate-api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "stalemate-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{ include "mclabels.selectorLabels" . }}
{{- end }}

{{/*
Returns the cloud provider name from global if exists or from the chart's values, defaults to minikube
*/}}
{{- define "stalemate-api.cloudProviderFlavor" -}}
{{- if .Values.global.cloudProvider.flavor }}
    {{- .Values.global.cloudProvider.flavor -}}
{{- else if .Values.cloudProvider -}}
    {{- .Values.cloudProvider.flavor | default "minikube" -}}
{{- else -}}
    {{ "minikube" }}
{{- end -}}
{{- end -}}

{{/*
Returns the cloud provider docker registry url from global if exists or from the chart's values
*/}}
{{- define "stalemate-api.cloudProviderDockerRegistryUrl" -}}
{{- if .Values.global.cloudProvider.dockerRegistryUrl }}
    {{- printf "%s/" .Values.global.cloudProvider.dockerRegistryUrl -}}
{{- else if .Values.cloudProvider.dockerRegistryUrl -}}
    {{- printf "%s/" .Values.cloudProvider.dockerRegistryUrl -}}
{{- else -}}
{{- end -}}
{{- end -}}

{{/*
Returns the cloud provider image pull secret name from global if exists or from the chart's values
*/}}
{{- define "stalemate-api.cloudProviderImagePullSecretName" -}}
{{- if .Values.global.cloudProvider.imagePullSecretName }}
    {{- .Values.global.cloudProvider.imagePullSecretName -}}
{{- else if .Values.cloudProvider.imagePullSecretName -}}
    {{- .Values.cloudProvider.imagePullSecretName -}}
{{- end -}}
{{- end -}}

{{/*
Returns the tracing url from global if exists or from the chart's values
*/}}
{{- define "stalemate-api.tracingUrl" -}}
{{- if .Values.global.tracing.url }}
    {{- .Values.global.tracing.url -}}
{{- else -}}
    {{- .Values.env.tracing.url -}}
{{- end -}}
{{- end -}}

{{/*
The GitHub App's private key is mounted from the chart's Secret as this file
*/}}
{{- define "stalemate-api.githubAppSecretName" -}}
{{- printf "%s-%s-github-app" .Release.Name (include "stalemate-api.name" .) -}}
{{- end -}}

{{- define "stalemate-api.privateKeyDir" -}}
/etc/stalemate/github-app
{{- end -}}

{{- define "stalemate-api.privateKeyFileName" -}}
private-key.pem
{{- end -}}

{{- define "stalemate-api.privateKeyPath" -}}
{{- printf "%s/%s" (include "stalemate-api.privateKeyDir" .) (include "stalemate-api.privateKeyFileName" .) -}}
{{- end -}}
