return async function () {
    $('#panel').scrollTop(0)
    
    let onlyPatient = true
    let offsetTime = $getUser('timeOffset')
    let visualOffsetTime = $getUser('visualTimeOffset')
    try {
        // Get all the inputs for pas creation
        let firstName = $getUser('firstName')
        let lastName = $getUser('lastName')
        let address = $getUser('createAddress')
        let address2 = $getUser('createAddress2')
        let city = $getUser('createCity')
        let county = $getUser('createCounty')
        let country = $getUser('createCountry')
        let postCode = $getUser('createPostCode')
        let mobile = $getUser('createMobile')
        let email = $getUser('createEmail')
        let home = $getUser('createHome')
        let international = $getUser('createInternationalPhone');
        let dob = $getUser('createDob')
        let sex = $getUser('createSex')
        let salutation = $getUser('createSalutation')
        let d

        // Get all inputs for compucare patient creation and appt booking
        let searchDate = $getUser('date')
        let clinicId = $getUser('clinicid')
        let time = $getUser('time')
        let duration = $getUser('duration')
        let solutionId = $getUser('solutionId')
        let bookingResponse

        searchDate = `${searchDate.split('-')[2]}-${searchDate.split('-')[1]}-${searchDate.split('-')[0]}`

        // Reformat date for conversion update
        let reformattedDate = moment(searchDate).format('Do MMMM YYYY')

        // Reformat date of birth to YYYYMMDD
        let dateOfBirth
        let dateOfBirthString
        
        if(dob){
            dob = `${dob.split('/')[2]}${dob.split('/')[1]}${dob.split('/')[0]}`
            dob = moment(dob, 'YYYYMMDD').format('YYYYMMDD')

            // Reformat date of birth for PAS creation
            // 2007-12-20T00:00:00 and 12/20/2007
            dateOfBirth = new Date(moment(dob)._d).toISOString().split('.')[0]
            dateOfBirthString = moment(dob).format('DD/MM/YYYY')
        }


        let sfGender
        // Reformat sex
        if(sex){
            if(sex == 'Male'){
                sfGender = sex
                sex = 'M'
            }else if(sex == 'Female'){
                sfGender = sex
                sex = 'F'
            }else if(sex== 'Other'){
                sfGender = 'Not Specified'
                sex = 'U'
            }
        }


        let payload = {
            bookType: 'createAndBook',
            firstName: firstName,
            lastName: lastName,
            address: address,
            address2: address2, 
            city: city,
            county: county,
            country: country,
            postCode: postCode,
            mobile: mobile,
            sfGender:sfGender,
            email: email,
            home: home,
            internationalPhone: international,
            dob: dob,
            dateOfBirth: dateOfBirth,
            dateOfBirthString: dateOfBirthString,
            sex: sex,
            salutation: salutation,
            searchDate: searchDate,
            reformattedDate: reformattedDate,
            clinicId: clinicId,
            time: time,
            timeOffset: offsetTime,
            duration: duration,
            solutionId: solutionId,
            conversionId: $getUser('conversionId'),
            userId: $getUser('paramsUserId'),
            condition: $getUser('condition'),
            conditionFinal: $getUser('conditionFinal'),
            speciality: $getUser('speciality'),
            paramsConsultant: $getUser('paramsConsultant'),
            consultant: $getUser('consultant'),
            visualConsultant: $getUser('visualConsultant'),
            insurer: $getUser('insurer')
        }

        console.log(payload)

       
        // Create patient and book one appointment

        if(!$getUser('visualClinicid') && firstName && lastName && dob){
            console.log('running first if')
            $setUser('loadingBooking', true)
            // Create patient
            d = await this.$wfGetData('-MbklqNRqUtcu5iYtd2L', payload)
            console.log(d)
            //console.log('created patient id, ', d.Patient_ID__c)
            // set patient Id for booking workflow
            payload.patientId = d.Patient_ID__c
            $setUser('bookingPatientId', d.Patient_ID__c)

            // if appointment selected book the appointment automatically
            if(clinicId && d.success){
                onlyPatient = false
                $setUser('bookingFinished', false)
                bookingResponse = await this.$wfGetData('-MZLcYJFpVnpb3NXnsYB', payload)

                //Stop booking and simulate error
                // bookingResponse = {
                //     response: "Simulating error"
                // }

                // this.models.firstName = firstName
                // this.models.lastName = lastName
                
                // Reset all the user values
                $setUser('dob', '')
                $setUser('firstName', '')
                $setUser('lastName', '')
                $setUser('createAddress', '')
                $setUser('createCity', '')
                $setUser('createCounty', '')
                $setUser('createCountry', '')
                $setUser('createPostCode', '')
                $setUser('createMobile', '')
                $setUser('createEmail', '')
                $setUser('createHome', '')
                $setUser('createInternationalPhone', '')
                $setUser('createDob', '')
                $setUser('createSex', '')
                $setUser('createSalutation', '')
                $setUser('createAddress2', '')
                $setUser('addressesFound', [])
                $setUser('searchSex', null)
            }

            try {
                // IF one appointment was booked correctly after creating a patient
                if(bookingResponse && bookingResponse.response.Status == 'Booked'){
                    $setUser('bookingFinished', true)
                    $setUser('successfulBooking', true)
                    $setUser('bookingID', bookingResponse.response.BookingId)
                    
                    let bookingDate = moment(bookingResponse.response.Start).format('DD-MM-YYYY')
                    let bookingTime = moment(bookingResponse.response.Start).format('HH:mm')
                    $setUser('bookingDate', bookingDate)
                    //$setUser('bookingTime', offsetTime)
                    $setUser('bookingTime', bookingTime)

                    // Hide create patient form
                    $setUser('showCreatePatient', false)

                    // Reset appointment date search after successful booking
                    $setUser('dateWeek', null)
                    $setUser('specificDate', null)
                    $setUser('onlyVisualFields', false)

                    // Reset all the user values
                    $setUser('dob', '')
                    $setUser('firstName', '')
                    $setUser('lastName', '')
                    $setUser('createAddress', '')
                    $setUser('createCity', '')
                    $setUser('createCounty', '')
                    $setUser('createCountry', '')
                    $setUser('createPostCode', '')
                    $setUser('createMobile', '')
                    $setUser('createEmail', '')
                    $setUser('createHome', '')
                    $setUser('createInternationalPhone', '')
                    $setUser('createDob', '')
                    $setUser('createSex', '')
                    $setUser('createSalutation', '')
                    $setUser('createAddress2', '')
                    $setUser('addressesFound', [])
                    $setUser('searchSex', null)
                    
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
                    $setUser('bookingFinished', false)

                    // Reset visual selected appointment
                    $setUser('visualSolutionId', null)
                    $setUser('visualLocation', '')
                    $setUser('visualConsultant', '')
                    $setUser('visualTime', '')
                    $setUser('visualTimeOffset', '')
                    $setUser('visualDate', '')
                    $setUser('visualClinicid', '')
                    $setUser('visualDuration', '')

                // Booking of one appointment finished but not successfully
                } else if(bookingResponse) {

                    // Finish booking process and show response
                    $setUser('bookingFinished', true)
                    $setUser('failedBooking', true)
                    $setUser('bookingResponse', bookingResponse.response)

                    // Hide create patient form
                    $setUser('showCreatePatient', false)

                    // Reset all the user values
                    $setUser('dob', '')
                    $setUser('firstName', '')
                    $setUser('lastName', '')
                    $setUser('createAddress', '')
                    $setUser('createCity', '')
                    $setUser('createCounty', '')
                    $setUser('createCountry', '')
                    $setUser('createPostCode', '')
                    $setUser('createMobile', '')
                    $setUser('createEmail', '')
                    $setUser('createHome', '')
                    $setUser('createInternationalPhone', '')
                    $setUser('createDob', '')
                    $setUser('createSex', '')
                    $setUser('createSalutation', '')
                    $setUser('createAddress2', '')
                    $setUser('addressesFound', [])
                    $setUser('searchSex', null)

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
                    $setUser('bookingFinished', false)

                    // Reset visual selected appointment
                    $setUser('visualSolutionId', null)
                    $setUser('visualLocation', '')
                    $setUser('visualConsultant', '')
                    $setUser('visualTime', '')
                    $setUser('visualTimeOffset', '')
                    $setUser('visualDate', '')
                    $setUser('visualClinicid', '')
                    $setUser('visualDuration', '')
                // If there was no appointment booking and just patient creation show response
                } else {
                    //console.log(d)
                    $setUser('loadingBooking', false)
                    // Successful patient creation
                    if(d.success){
                        $setUser('patientCreated', true)
                        $setUser('newPatientID', d.Patient_ID__c)
                        setTimeout(() => {
                            $setUser('patientCreated', false)
                        }, 5000)
                        
                        this.models.firstName = firstName
                        this.models.lastName = lastName
                        $setUser('patientError', false)
                        $setUser('creationError', false)

                        // Reset all the user values
                        $setUser('dob', '')
                        $setUser('firstName', '')
                        $setUser('lastName', '')
                        $setUser('createAddress', '')
                        $setUser('createCity', '')
                        $setUser('createCounty', '')
                        $setUser('createCountry', '')
                        $setUser('createPostCode', '')
                        $setUser('createMobile', '')
                        $setUser('createEmail', '')
                        $setUser('createHome', '')
                        $setUser('createInternationalPhone', '')
                        $setUser('createDob', '')
                        $setUser('createSex', '')
                        $setUser('createSalutation', '')
                        $setUser('createAddress2', '')
                        $setUser('addressesFound', [])
                        $setUser('dob', '')
                        $setUser('searchSex', null)

                        getPatients(true)

                    // Issues with patient creation
                    }else if(d.issues){
                        $setUser('patientError', true)
                        $setUser('creationError', true)
                        $setUser('errorMessage', d.issues.errors[0].errorText)
                        setTimeout(() => {
                            $setUser('patientError', false)
                            $setUser('creationError', false)
                            $setUser('errorMessage', '')
                        }, 10000)
                    // Any other errors during patient creation
                    } else {
                        $setUser('patientError', true)
                        $setUser('creationError', true)
                        $setUser('errorMessage', 'error of type 400 occured, please check your data')
                        setTimeout(() => {
                            $setUser('patientError', false)
                            $setUser('creationError', false)
                            $setUser('errorMessage', '')
                        }, 10000)
                    }
                    // If no errors reset values
                    if(!$getUser('patientError')){
                        $setUser('loadingBooking', false)
                        $setUser('showCreatePatient', false)
                        this.$set(this.globalModels, 'loadingPatients', true)
                        this.$set(this.globalModels, 'patientSearchApplied', true)
                        $refreshAsync('getPatients')
                    }

                }
                    
        } catch (error) {
            console.log('Something went wrong while creating a patient or booking a single appt...')
            $setUser('bookingFinished', true)
            $setUser('failedBooking', true)
            console.log(error)
        }
            
            // Create patient and book two appointments
        } else if($getUser('visualClinicid') && firstName && lastName && dob) {
            onlyPatient = false
            $setUser('loadingBooking', true)
            d = await this.$wfGetData('-MbklqNRqUtcu5iYtd2L', payload)
            //console.log('d is ', d)
            //console.log('created patient id, ', d.Patient_ID__c)
            // set patient Id for booking workflow
            payload.patientId = d.Patient_ID__c
            $setUser('bookingPatientId', d.Patient_ID__c)

            let visualSearchDate = $getUser('visualDate')
            visualSearchDate = `${visualSearchDate.split('-')[2]}-${visualSearchDate.split('-')[1]}-${visualSearchDate.split('-')[0]}`
            
            // reformat date for conversion update
            let reformattedVisualDate = moment(visualSearchDate).format('Do MMMM YYYY')

            // extend payload with visual appointment information
            payload.visualSearchDate = visualSearchDate,
            payload.reformattedVisualDate = reformattedVisualDate
            payload.visualClinicId = $getUser('visualClinicid'),
            payload.visualTime = $getUser('visualTime'),
            payload.visualTimeOffset = visualOffsetTime
            payload.visualDuration = $getUser('visualDuration'),
            payload.visualSolutionId = $getUser('visualSolutionId')
            //console.log(payload)

            if(clinicId && d.success){
                d = await this.$wfGetData('-McrXrRL7tplIUwh1JqD', payload)
                //console.log(d)
                this.models.firstName = firstName
                this.models.lastName = lastName

                // Reset all the user values
                $setUser('dob', '')
                $setUser('firstName', '')
                $setUser('lastName', '')
                $setUser('createAddress', '')
                $setUser('createCity', '')
                $setUser('createCounty', '')
                $setUser('createCountry', '')
                $setUser('createPostCode', '')
                $setUser('createMobile', '')
                $setUser('createEmail', '')
                $setUser('createHome', '')
                $setUser('createInternationalPhone', '')
                $setUser('createDob', '')
                $setUser('createSex', '')
                $setUser('createSalutation', '')
                $setUser('createAddress2', '')
                $setUser('addressesFound', [])
                $setUser('searchSex', null)
            }
            

            try {
                if(d.response && d.visualResponse && d.response.Status == 'Booked' && d.visualResponse.Status == 'Booked'){
                    // Set visual booking date and time
                    let visualDate = moment(d.visualResponse.Start).format('DD-MM-YYYY')
                    let visualTime = moment(d.visualResponse.Start).format('HH:mm')
                    $setUser('visualBookingDate', visualDate)
                    //$setUser('visualBookingTime', VisualOffsetTime)
                    $setUser('visualBookingTime', visualTime)

                    // Set normal appt booking date and time
                    let bookingDate = moment(d.response.Start).format('DD-MM-YYYY')
                    let bookingTime = moment(d.response.Start).format('HH:mm')
                    $setUser('bookingDate', bookingDate)
                    //$setUser('bookingTime', offsetTime)
                    $setUser('bookingTime', bookingTime)

                    // Show first appointment info
                    $setUser('successfulBooking', true)
                    $setUser('bookingID', d.response.BookingId)
                    // Show visual booking info
                    $setUser('visualBookingID', d.visualResponse.BookingId)

                    // Reset appointment date search after successful booking
                    $setUser('dateWeek', null)
                    $setUser('specificDate', null)
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

                    // Reset visual selected appointment
                    $setUser('visualSolutionId', null)
                    $setUser('visualLocation', '')
                    $setUser('visualConsultant', '')
                    $setUser('visualTime', '')
                    $setUser('visualTimeOffset', '')
                    $setUser('visualDate', '')
                    $setUser('visualClinicid', '')
                    $setUser('visualDuration', '')
                } else if(d.response && d.visualResponse) {
                    $setUser('failedBooking', true)
                     $setUser('bookingFinished', true)
                    $setUser('bookingResponse', 'Something went wrong, please try picking a different slot...')
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
                    $setUser('bookingFinished', false)

                    // Reset visual selected appointment
                    $setUser('visualSolutionId', null)
                    $setUser('visualLocation', '')
                    $setUser('visualConsultant', '')
                    $setUser('visualTime', '')
                    $setUser('visualTimeOffset', '')
                    $setUser('visualDate', '')
                    $setUser('visualClinicid', '')
                    $setUser('visualDuration', '')
                } else if(d.patient){
                    $setUser('failedBooking', true)
                    $setUser('bookingResponse', 'Something went wrong, please try picking a different slot...')
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
                    $setUser('bookingFinished', false)

                    // Reset visual selected appointment
                    $setUser('visualSolutionId', null)
                    $setUser('visualLocation', '')
                    $setUser('visualConsultant', '')
                    $setUser('visualTimeOffset', '')
                    $setUser('visualDate', '')
                    $setUser('visualClinicid', '')
                    $setUser('visualDuration', '')
                }
                else {
                    console.log('patient created')
                    //console.log(d)
                    if(d.success){
                        $setUser('patientCreated', true)
                        $setUser('newPatientID', d.Patient_ID__c)
                        setTimeout(() => {
                            $setUser('patientCreated', false)
                        }, 5000)
                        
                        this.models.firstName = firstName
                        this.models.lastName = lastName
                    } else if(d.issues){
                        $setUser('patientError', true)
                        $setUser('creationError', true)
                        $setUser('errorMessage', d.issues.errors[0].errorText)
                        setTimeout(() => {
                            $setUser('patientError', false)
                            $setUser('creationError', false)
                            $setUser('errorMessage', '')
                        }, 10000)
                    } else {
                        console.log(d)
                        $setUser('patientError', true)
                        $setUser('creationError', true)
                        $setUser('errorMessage', 'error of type 400 occured, please check your data')
                        setTimeout(() => {
                            $setUser('patientError', false)
                            $setUser('creationError', false)
                            $setUser('errorMessage', '')
                        }, 10000)
                    }
                }

                // If no error hide the form and reload list
                if(!$getUser('patientError')){
                    $setUser('showCreatePatient', false)
                    this.$set(this.globalModels, 'loadingPatients', true)
                    this.$set(this.globalModels, 'patientSearchApplied', true)
                }

            } catch(error) {            
                console.log('Something went wrong while creating a patient or booking a double appt...')
                $setUser('bookingFinished', true)
                $setUser('failedBooking', true)
                console.log(error)
            }
        } else {
            console.log(d)
        }


        if(!onlyPatient){
            $setUser('loadingBooking', false)
            $setUser('bookingFinished', true)
        }

        $('#panel').scrollTop(0)

    }

    catch (error) {
        console.log('Something went wrong while creating a patient or booking an appt...')
        $setUser('bookingFinished', true)
        $setUser('failedBooking', true)
        console.log(error)
    }
}
