return async function() {
    if(confirm('Are you sure you wish to override the NPE Designated rule?')) {
        this.globalModels.override = true
        window.getAppointments()
    }
}