return async function (patientId, patientInfo){

try {
    let searchDate = $getUser('date')
    let clinicId = $getUser('clinicid')
    let time = $getUser('time')
    let duration = $getUser('duration')
    let solutionId = $getUser('solutionId')
    let d 
    let dateOfBirth
    let dateOfBirthString

    // Reformat date of birth
    let dateArray = [...patientInfo.Date_of_Birth]
    let year = `${dateArray[0]}${dateArray[1]}${dateArray[2]}${dateArray[3]}`
    let month = `${dateArray[4]}${dateArray[5]}`
    let day = `${dateArray[6]}${dateArray[7]}`

    dateOfBirth = `${year}-${month}-${day}T00:00:00`
    dateOfBirthString = `${month}/${day}/${year}`

    let sfGender 
    if(patientInfo.patientInfo.Sex__c) {
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
        clinicId: clinicId,
        time: time,
        sfGender,
        patientId: patientId,
        patientInfo: patientInfo,
        dateOfBirth: dateOfBirth,
        dateOfBirthString: dateOfBirthString,
        duration: duration,
        solutionId: solutionId,
        conversionId: $getUser('conversionId'),
        bookingID:$getUser('bookingID'),
        patientSystemNumber:$getUser('patientSystemNumber')
    }

    console.log(payload)
    if(!$getUser('visualClinicid')){
        d = await this.$wfGetData('-MZLcYJFpVnpb3NXnsYB', payload)
    } else {
        // extend payload with visual appointment information
    

            payload.visualSearchDate = $getUser('visualDate'),
            payload.visualClinicId = $getUser('visualClinicid'),
            payload.visualTime = $getUser('visualTime'),
            payload.visualDuration = $getUser('visualDuration'),
            payload.visualSolutionId = $getUser('visualSolutionId')
        

        d = await this.$wfGetData('-McrXrRL7tplIUwh1JqD', payload)
    }
    
    
    

    try {
        console.log(d)
        if(!$getUser('visualClinicid') && d.response.Status == 'Booked'){
            $setUser('successfulBooking', true)
            $setUser('bookingID', d.response.BookingId)
            $setUser('bookingDateTime', d.response.Start)
            $setUser('patientSystemNumber', d.response.PatientSystemNumber)

            // reformat date
            let date = d.response.Start
            date = date.split('T')[0]
            date = `${date.split('-')[2]}-${date.split('-')[1]}-${date.split('-')[0]}`
            console.log(date)
            $setUser('bookingDate', date)

            console.log(date)
        } else if(!$getUser('visualClinicid')) {
            $setUser('failedBooking', true)
            $setUser('bookingResponse', d.response)
        } else if($getUser('visualClinicid')){
            console.log('from double booking')
        }

        // Reset selected appointment
        $setUser('solutionId', null)
        $setUser('location', '')
        $setUser('consultant', '')
        $setUser('time', '')
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
        $setUser('visualDate', '')
        $setUser('visualClinicid', '')
        $setUser('visualDuration', '')
    }

    catch (error) {
        console.log(error)
    }
    return d
}

catch (error) {
    console.log(error)
}

}




