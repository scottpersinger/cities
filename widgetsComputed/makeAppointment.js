return async function (patientId, patientInfo){

$('#panel').scrollTop(0)

try {
    let searchDate = $getUser('date')
    let clinicId = $getUser('clinicid')
    let time = $getUser('time')
    let offsetTime = $getUser('timeOffset')
    let visualOffsetTime = $getUser('visualTimeOffset')
    let duration = $getUser('duration')
    let solutionId = $getUser('solutionId')
    let d 
    let dateOfBirth
    let dateOfBirthString
    $setUser('bookingPatientId',patientId)

    // Reformat date of birth and search date
    dateOfBirth= moment(patientInfo.Date_of_Birth.substring(8, 0)).format('YYYY-MM-DD')
    dateOfBirth = `${dateOfBirth}T00:00:00`

    dateOfBirthString = moment(patientInfo.Date_of_Birth.substring(8, 0)).format('MM/DD/YYYY')
 
    searchDate = `${searchDate.split('-')[2]}-${searchDate.split('-')[1]}-${searchDate.split('-')[0]}`

    // Reformat date for conversion update
    let reformattedDate = moment.utc(searchDate).format('Do MMMM YYYY')
    let sfGender 
    if(patientInfo.Sex__c) {
        if(patientInfo.Sex__c == 'M') {
            sfGender = 'Male'
        } else if(patientInfo.Sex__c == 'F') {
            sfGender = 'Female'
        } else {
            sfGender = 'Not Specified'
        }
    }
    let payload = {
        bookType: 'bookOnly',
        searchDate: searchDate,
        reformattedDate: reformattedDate,
        clinicId: clinicId,
        time: time,
        timeOffset: offsetTime,
        sfGender,
        patientId: patientId,
        patientInfo: patientInfo,
        // Patient Info
        address: patientInfo.addresses[0].Street__c,
        firstName: patientInfo.First_Name__c,
        lastName: patientInfo.Last_Name__c,
        sex: patientInfo.Sex__c,
        salutation: patientInfo.Salutation__c,
        city: patientInfo.addresses[0].City_Town__c,
        county: patientInfo.addresses[0].County_Region__c,
        address2: patientInfo.addresses[0].addr2,
        postCode: patientInfo.addresses[0].Post_Code__c,
        mobile: patientInfo.Mobile_Phone__c,
        email: patientInfo.Email__c,
        home: patientInfo.Home_Phone__c,

        dateOfBirth: dateOfBirth,
        dateOfBirthString: dateOfBirthString,
        duration: duration,
        solutionId: solutionId,
        conversionId: $getUser('conversionId'),
        bookingID:$getUser('bookingID'),
        patientSystemNumber: $getUser('patientSystemNumber'),
        userId: $getUser('paramsUserId'),
        condition: $getUser('condition'),
        conditionFinal: $getUser('conditionFinal'),
        speciality: $getUser('speciality'),
        paramsConsultant: $getUser('paramsConsultant'),
        insurer: $getUser('insurer'),
        consultant: $getUser('consultant'),
        visualConsultant: $getUser('visualConsultant')
    }

    console.log('payload to make appt is ', payload)


    if(!$getUser('visualClinicid')){
        // If no visual clinic id book an appt without visual fields
        console.log('payload for booking an appt is, ', payload)
        d = await this.$wfGetData('-MZLcYJFpVnpb3NXnsYB', payload)
    } else {
        let visualSearchDate = $getUser('visualDate')
        visualSearchDate = `${visualSearchDate.split('-')[2]}-${visualSearchDate.split('-')[1]}-${visualSearchDate.split('-')[0]}`

        // reformat date for conversion update
        let reformattedVisualDate = moment(visualSearchDate).format('Do MMMM YYYY')

        // extend payload with visual appointment information
        payload.visualSearchDate = visualSearchDate,
        payload.visualClinicId = $getUser('visualClinicid'),
        payload.visualTime = $getUser('visualTime'),
        payload.visualTimeOffset = visualOffsetTime,
        payload.reformattedVisualDate = reformattedVisualDate
        payload.visualDuration = $getUser('visualDuration'),
        payload.visualSolutionId = $getUser('visualSolutionId')
        console.log('payload is', payload)

        d = await this.$wfGetData('-McrXrRL7tplIUwh1JqD', payload)
    }
    
    
    

    try {
        console.log(d)
        if(!$getUser('visualClinicid') && d.response && d.response.Status == 'Booked'){
            $setUser('successfulBooking', true)
            $setUser('bookingID', d.response.BookingId)

            let bookingDate = moment(d.response.Start).format('DD-MM-YYYY')
            let bookingTime = moment(d.response.Start).format('HH:mm')
            $setUser('bookingDate', bookingDate)
            //$setUser('bookingTime', offsetTime)
            $setUser('bookingTime', bookingTime)

            $setUser('patientSystemNumber', d.response.PatientSystemNumber)

            // reformat date
            let date = moment(d.response.Start).format('DD-MM-YYYY')
            $setUser('bookingDate', date)
            
            // Reset appointment date search after successful booking
            $setUser('dateWeek', null)
            $setUser('specificDate', null)
            $setUser('onlyVisualFields', false)

            // Reset patient search values after successful booking
            this.models.firstName = ''
            this.models.lastName = ''
            this.models.dob = ''
            this.models.nhs_num = ''
            this.models.visual = ''

            $setUser('firstName', '')
            $setUser('dob', '')
            $setUser('lastName', '')
            $setUser('searchSex', null)

        } else if(!$getUser('visualClinicid')) {
            $setUser('failedBooking', true)
            $setUser('bookingResponse', d.response)
            this.models.visual = ''
            $setUser('onlyVisualFields', false)

            // Reset selected appointment
            $setUser('solutionId', null)
            $setUser('location', '')
            $setUser('consultant', '')
            $setUser('time', '')
            $setUser('timeOffset', '')
            $setUser('date', '')
            $setUser('clinicid', '')
            $setUser('duration', '')
            $setUser('loadingBooking', false)
            $setUser('bookingFinished', true)

            // Reset visual selected appointment
            $setUser('visualSolutionId', null)
            $setUser('visualLocation', '')
            $setUser('visualConsultant', '')
            $setUser('visualTime', '')
            $setUser('visualTimeOffset', '')
            $setUser('visualDate', '')
            $setUser('visualClinicid', '')
            $setUser('visualDuration', '')

            $setUser('firstName', '')
            $setUser('lastName', '')
            $setUser('dob', '')
            $setUser('searchSex', null)

            
        } else if($getUser('visualClinicid')){
            let visualDate = $getUser('visualDate')
            $setUser('visualBookingDate', visualDate)

            
            if(d.response && d.visualResponse && d.response.BookingId && d.visualResponse.BookingId){
                // Show first appointment info
                $setUser('successfulBooking', true)
                $setUser('bookingID', d.response.BookingId)

                // Set normal appt booking date and time
                let bookingDate = moment(d.response.Start).format('DD-MM-YYYY')
                let bookingTime = moment(d.response.Start).format('HH:mm')
                $setUser('bookingDate', bookingDate)
                //$setUser('bookingTime', offsetTime)
                $setUser('bookingTime', bookingTime)

                // Set visual booking date and time
                let visualDate = moment(d.visualResponse.Start).format('DD-MM-YYYY')
                let visualTime = moment(d.visualResponse.Start).format('HH:mm')
                $setUser('visualBookingDate', visualDate)
                //$setUser('visualBookingTime', visualOffsetTime)
                $setUser('visualBookingTime', visualTime)

                $setUser('patientSystemNumber', d.response.PatientSystemNumber)

                // Show visual booking info
                $setUser('visualBookingID', d.visualResponse.BookingId)

                // Reset appointment date search after successful booking
                $setUser('dateWeek', null)
                $setUser('specificDate', null)
                $setUser('onlyVisualFields', false)
                this.models.visual = ''
                
                // Reset patient search values after successful booking
                this.models.firstName = ''
                this.models.lastName = ''
                this.models.dob = ''
                this.models.nhs_num = ''

                $setUser('firstName', '')
                $setUser('lastName', '')
                $setUser('dob', '')
                $setUser('searchSex', null)

            } else {
                $setUser('failedBooking', true)
                $setUser('bookingResponse', 'Sorry, something went wrong, please select a different slot')
                $setUser('onlyVisualFields', false)
                this.models.visual = ''

                // Reset selected appointment
                $setUser('solutionId', null)
                $setUser('location', '')
                $setUser('consultant', '')
                $setUser('time', '')
                $setUser('timeOffset', '')
                $setUser('date', '')
                $setUser('clinicid', '')
                $setUser('duration', '')
                $setUser('loadingBooking', false)
                $setUser('bookingFinished', true)

                // Reset visual selected appointment
                $setUser('visualSolutionId', null)
                $setUser('visualLocation', '')
                $setUser('visualConsultant', '')
                $setUser('visualTime', '')
                $setUser('visualTimeOffset', '')
                $setUser('visualDate', '')
                $setUser('visualClinicid', '')
                $setUser('visualDuration', '')

                $setUser('firstName', '')
                $setUser('lastName', '')
                $setUser('dob', '')
                $setUser('searchSex', null)
            }

        }

        // Reset selected appointment
        $setUser('solutionId', null)
        $setUser('location', '')
        $setUser('consultant', '')
        $setUser('time', '')
        $setUser('timeOffset', '')
        $setUser('date', '')
        $setUser('clinicid', '')
        $setUser('duration', '')
        $setUser('loadingBooking', false)
        $setUser('bookingFinished', true)

        // Reset visual selected appointment
        $setUser('visualSolutionId', null)
        $setUser('visualLocation', '')
        $setUser('visualConsultant', '')
        $setUser('visualTime', '')
        $setUser('visualTimeOffset', '')
        $setUser('visualDate', '')
        $setUser('visualClinicid', '')
        $setUser('visualDuration', '')
        
        $setUser('firstName', '')
        $setUser('lastName', '')
        $setUser('dob', '')
        $setUser('searchSex', null)
    }

    catch (error) {
        $setUser('failedBooking', true)
        $setUser('bookingResponse', 'Sorry, something went wrong, please select a different slot')
        $setUser('onlyVisualFields', false)
        this.models.visual = ''
        console.log(error)
    }
    return d
}

catch (error) {
    console.log(error)
    $setUser('failedBooking', true)
    $setUser('bookingResponse', 'Sorry, something went wrong, please select a different slot')
    $setUser('onlyVisualFields', false)
    this.models.visual = ''
}

}




