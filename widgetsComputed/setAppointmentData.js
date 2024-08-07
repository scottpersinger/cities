return async function(dataType, row) {
    if(dataType == 'visual'){
        $setUser('visualLocation', row.clinic.locationName)
        $setUser('visualSolutionId', row.clinic.solutionID)
        $setUser('visualDuration', this.getDuration(row.Start, row.End))
        $setUser('visualConsultant', row.clinic.consultantName)
        $setUser('visualSolutionName', row.clinic.solutionName)
        $setUser('visualTime', moment(row.Start).format('HH:mm'))
        $setUser('visualTimeOffset', moment(row.StartOffset).format('HH:mm'))
        $setUser('visualDate', moment(row.Start).format('DD-MM-YYYY'))
        $setUser('visualClinicid', row.clinic.Clinic_ID__c )
        
        $setUser('onlyVisualFields', false)

        $setCurrentTab('-MWP_CXNtUXW4MBilXHZ');
        this.models.visual = ''
    } else if(dataType == 'glaucoma') {
        $setUser('solutionId', row.clinic.solutionID)
        $setUser('location', row.clinic.locationName)
        $setUser('consultant', row.clinic.consultantName)
        $setUser('solutionName', row.clinic.solutionName)
        $setUser('time', moment(row.Start).format('HH:mm'))
        $setUser('timeOffset', moment(row.StartOffset).format('HH:mm'))
        $setUser('date', moment(row.Start).format('DD-MM-YYYY'))
        $setUser('clinicid', row.clinic.Clinic_ID__c )
        $setUser('duration', this.getDuration(row.Start, row.End))
        $setUser('visual', 'select')
        $setUser('onlyVisualFields', true);
        this.models.visual = 'select'
        $('#panel').scrollTop(0)
    } else {
        console.log('appointment data is, ', row)
        $setUser('solutionId', row.clinic.solutionID)
        $setUser('location', row.clinic.locationName)
        $setUser('consultant', row.clinic.consultantName)
        $setUser('solutionName', row.clinic.solutionName)
        $setUser('time', moment(row.Start).format('HH:mm'))
        $setUser('timeOffset', moment(row.StartOffset).format('HH:mm'))
        $setUser('date', moment(row.Start).format('DD-MM-YYYY'))
        $setUser('clinicid', row.clinic.Clinic_ID__c )
        $setUser('duration', this.getDuration(row.Start, row.End))
        $setCurrentTab('-MWP_CXNtUXW4MBilXHZ') 
    }
}