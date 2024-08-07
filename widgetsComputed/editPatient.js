return async function(patientInfo) { 
    if(patientInfo.Date_of_Birth){

        console.log('patient info is', patientInfo)
        $setUser('patientEdit', true)

        // Reformat date of birth
        let dateOfBirth = moment(patientInfo.Date_of_Birth.substring(8, 0)).format('DD/MM/YYYY')

       let sex = patientInfo.Sex__c
       if(sex == 'M'){
           sex = 'Male'
       }else if(sex == 'F'){
           sex = 'Female'
       }else {
           sex = 'Other'
       }


        $setUser('editDOD', patientInfo.Date_of_Death__c ? patientInfo.Date_of_Death__c : '' )
        $setUser('editDOB', dateOfBirth ? dateOfBirth : '')
        $setUser('editEmail', patientInfo.Email__c ? patientInfo.Email__c : '')
        $setUser('editFirstName', patientInfo.First_Name__c ? patientInfo.First_Name__c : '')
        $setUser('editMiddleName', patientInfo.Middle_Name_If_any__c ? patientInfo.Middle_Name_If_any__c : '')
        $setUser('editLastName', patientInfo.Last_Name__c ? patientInfo.Last_Name__c : '')
        $setUser('editHomePhone', patientInfo.Home_Phone__c ? patientInfo.Home_Phone__c : '')
        $setUser('editMarital', patientInfo.Marital_Status__c ? patientInfo.Marital_Status__c : '')
        $setUser('editMobile', patientInfo.Mobile_Phone__c ? patientInfo.Mobile_Phone__c : '')
        $setUser('editInternationalPhone', patientInfo.Int_Phone__c ? patientInfo.Int_Phone__c : '')
        $setUser('editNHS', patientInfo.NHS_Number__c ? patientInfo.NHS_Number__c : '')
        $setUser('editSalutation', patientInfo.Salutation__c ? patientInfo.Salutation__c : '')
        $setUser('editSex', sex ? sex : '')
        $setUser('editCity', patientInfo.addresses[0].City_Town__c ? patientInfo.addresses[0].City_Town__c : '')
        $setUser('editPostCode', patientInfo.addresses[0].Post_Code__c ? patientInfo.addresses[0].Post_Code__c : '')
        $setUser('editAddress', patientInfo.addresses[0].Street__c ? patientInfo.addresses[0].Street__c : '')
        $setUser('editAddress2',  patientInfo.addresses[0].addr2 ? patientInfo.addresses[0].addr2 : '') 
        $setUser('editCounty', patientInfo.addresses[0].County_Region__c ? patientInfo.addresses[0].County_Region__c : '')
        $setUser('editPatientID', patientInfo.Patient_ID__c)
    } else {

         $('#panel').scrollTop(0)

        const payload = {
            firstName: $getUser('editFirstName'),
            lastName: $getUser('editLastName'),
            email: $getUser('editEmail'),
            homePhone: $getUser('editHomePhone'),
            mobile: $getUser('editMobile'),
            internationalPhone: $getUser('editInternationalPhone'),
            city: $getUser('editCity'),
            address: $getUser('editAddress'),
            address2: $getUser('editAddress2'),
            county: $getUser('editCounty'),
            postCode: $getUser('editPostCode'),
            patientID: $getUser('editPatientID'),
            dob: $getUser('editDOB'),
        }

        //console.log(payload)
        $setUser('loadingBooking', true)

        try{
            console.log('Edit payload is: ', payload);
            let d = await this.$wfGetData('-MchKsOz3mtk8njeOhN4', payload)
            $setUser('loadingBooking', false)
            //console.log('pas response is', d)
            if(d.success) {
                $setUser('patientEdited', true)
                // setTimeout(() => {
                //     $setUser('patientEdited', false)
                // }, 10000)
                
                // Set the names in search inputs
                this.models.firstName = $getUser('editFirstName')
                this.models.lastName = $getUser('editLastName')

                console.log('now reload the search')
                window.getPatients(true)
                $setUser('editError', false)
                $setUser('patientError', false)
                
            } else if(d.issues) {
                $setUser('patientError', true)
                $setUser('editError', true)
                $setUser('errorMessage', d.issues.errors[0].errorText)
                setTimeout(() => {
                    $setUser('patientError', false)
                    $setUser('editError', false)
                    $setUser('errorMessage', '')
                }, 10000)
            } else {
                $setUser('patientError', true)
                $setUser('editError', true)
                $setUser('errorMessage', d)
                setTimeout(() => {
                    $setUser('patientError', false)
                    $setUser('editError', false)
                    $setUser('errorMessage', '')
                }, 10000)
            }

            
            // if no error hide form, reset values and reload list
            if(!$getUser('patientError')){
                $setUser('patientEdit', false)
                this.$set(this.globalModels, 'loadingPatients', true)
                this.$set(this.globalModels, 'patientSearchApplied', true)

                // reset all the edit values
                $setUser('editDOD', '')
                $setUser('editDOB', '')
                $setUser('editEmail', '')
                $setUser('editFirstName', '')
                $setUser('editMiddleName', '')
                $setUser('editLastName', '')
                $setUser('editHomePhone', '')
                $setUser('editMarital', '')
                $setUser('editMobile', '')
                $setUser('editNHS', '')
                $setUser('editSalutation', '')
                $setUser('editSex', '')
                $setUser('editCity', '')
                $setUser('editPostCode', '')
                $setUser('editAddress', '')
                $setUser('editCounty', '')
                $setUser('editInternationalPhone', '')
            }

        $('#panel').scrollTop(0)

        } catch (err){
            console.log(err)
        }
    }
}