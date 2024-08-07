window.getPatients = async (resetCache) => {
    $('#panel').scrollTop($('#widget-MZWwEn6_JgXEj_uDPGQ')[0].offsetTop)
  $vm.$set($vm.globalModels, "patientsLoaded", false);
  $vm.$set($vm.globalModels, "patientsError", null);
  $vm.$set($vm.globalModels, "patients", null)

    console.log('global models is', $vm.globalModels, $vm.models)

  if (resetCache){
      console.log('reset cache called')
    delete sessionStorage.getPatients

  } 
    let sessionData = null
  try {

      console.log('getPatients running custom')
      let dob = $vm.globalModels.dob, firstName = $vm.globalModels.firstName,
      lastName = $vm.globalModels.lastName, nhs_num = $vm.globalModels.nhs_num, dobTest = true, nhsTest = true, validationAlert,
      gender = $getUser('searchSex')

      $vm.$set($vm.globalModels, 'patientSearchApplied', false)

      if(dob || nhs_num){
          let nhs_numRegExp = new RegExp("^[0-9]+$")

          if(dob){
            dobTest = moment(dob, 'DD/MM/YYYY', true);
            dobTest = dobTest && dobTest.isValid();
          }
            
          if(nhs_num){
              nhsTest = nhs_numRegExp.test(nhs_num)
          }

          if(nhs_num && nhs_num.length !== 10){
              nhsTest = false
          }
    


        if(dob){
            console.log('DOB TEST IS: ', dobTest)
            if(dobTest){
              // Reformat the date
              dob = `${dob.split("/")[2]}${dob.split("/")[1]}${dob.split("/")[0]}`
          }else{
            validationAlert = true
          } 
        } else {
            dobTest = false
        }

          

        //   if(!nhsTest){
        //       validationAlert = true
        //   }
      }

      if(!dob) {
          dobTest = false
          validationAlert = true
      }

      if(!gender) {
         validationAlert = true
      }

      


      const payload = {
          dob: dob,
          firstName: firstName,
          lastName: lastName,
          nhs_num: nhs_num,
          gender
      }

      console.log('patient payload is ', payload)

      let d

      if(!validationAlert && (dob || nhs_num)){
          $setUser('validationMessage', null)
          $setUser('noPatientsFound', null)

          // Check for session storage
          try {
              sessionData = JSON.parse(sessionStorage.getPatients)
          } catch (error) {
              console.log('error processing session data')
              sessionData = null
          }

          if(  !sessionData || sessionData.dob !== dob || sessionData.firstName !== firstName || sessionData.lastName !== lastName || sessionData.nhs_num !== nhs_num){
              console.log('getting patients from workflow')
              // function to call the workflow
              d = await $vm.$wfGetData('-MZC30sHPhfUDCkpF7IZ', payload)
                console.log('d is', d)
              if (d instanceof Error) {
                  console.log(d.message)

                  return { error: d.message }

                  return
                  
              }
              sessionStorage.getPatients = JSON.stringify({
                  dob: dob,
                  firstName: firstName,
                  lastName: lastName,
                  nhs_num: nhs_num,
                  data: d
              })
          } else {
              console.log('getting patients from session storage')
              d = sessionData.data
          }
          if (d.status){
              console.log('timeout error',d)
              alert('Something went wrong during the patient search, please check the data and try again...')
              return { error: 'The patient database did not respond in the required time, please click refresh to try again or contact support if the issue persists.' }
          }
          if(!d || !d.patients || d.patients.length == 0){
              $setUser('noPatientsFound', true)
          }else{
              $setUser('noPatientsFound', null)
          }
      } else {
          if(!dob && !gender){
              $setUser('validationMessage', 'missingData')
          } else if(validationAlert){
              $setUser('validationMessage', true)
            //   if(!nhsTest){
            //     $setUser('validationNHS', true)
            //     setTimeout(() => {
            //         $setUser('validationNHS', '')
            //     }, 5000)
            //   }
              if(!dobTest){
                  console.log('dob missing')
                $setUser('validationDOB', true)
                setTimeout(() => {
                    $setUser('validationDOB', '')
                }, 5000)
              }

              if(!gender) {
                $setUser('validationSex', true)
                setTimeout(() => {
                    $setUser('validationSex', '')
                }, 5000)
              }
          }
          
          $vm.$set($vm.globalModels, "patientsLoaded", true)
      }

      //console.log('patient array is is', d.patients)

        // d.patients.forEach(pat => {
        //     if(pat.Sex__c !== 'M' && pat.Sex__c !== 'F') {
        //         console.log('dif ', pat)
        //     }
        // })

          if(d && d.length == 0){
              $setUser('noPatientsFound', true)
          }else{
              $setUser('noPatientsFound', null)
          }
      // Reset Loader
      $vm.$set($vm.globalModels, 'loadingPatients', false)

      
    if(d && d.patients) {
        console.log("patients data is ", d.patients);

        $vm.$set($vm.globalModels, "patients", d.patients);
    }
    $vm.$set($vm.globalModels, "patientsLoaded", true);
  } catch (err) {
    console.error(err);

    $vm.$set($vm.globalModels, "patientsError", err.message);
    $vm.$set($vm.globalModels, "patients", []);
  }
};
