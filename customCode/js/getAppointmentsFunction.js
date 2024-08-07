window.getAppointments = async (resetCache, override) => {

  // Setting the messages and data needed
  $vm.$set($vm.globalModels, "appointmentsLoaded", false);
  $vm.$set($vm.globalModels, "appointmentsError", null);
  $vm.$set($vm.globalModels, "appointments", null)
  $vm.$set($vm.globalModels, "overrideMsg", null)
  $vm.$set($vm.globalModels, "override", override)

  if (resetCache) delete sessionStorage.getAppointments

  try {
    // Get dates from inputs to search by
    let specificDate = $getUser("specificDate");
    let date = $getUser("dateWeek");

    // Get parameters passed from Salesforce visualforce page
    const params = await getParams();

    if (params.conditionFinal){
      params.condition = params.conditionFinal
      console.log('final condition used',params.conditionFinal)
    } 

    // Set up payload to be passed to workflow (backend)
    let payload = {
      dateWeek: date,
      specificDate: specificDate,
      timeout: 300000,
      params,
      override: $vm.globalModels.override ? $vm.globalModels.override : false
    };

    

    let paramsValues;

    if (params) {
      paramsValues = Object.values(params);
    } else {
      paramsValues = [];
    }

    let sessionData = null;

    try {
      sessionData = JSON.parse(sessionStorage.getAppointments);
    } catch (error) {
      sessionData = null;
    }

    let d;

    // Check if other values in params are the same as in session storage
    let arrayOfTruth = [];
    if (paramsValues && sessionData) {
      paramsValues.forEach((value) => {
        if (sessionData.paramsValues) {
          sessionData.paramsValues.forEach((val) => {
            if (value === val && value.length > 0) {
              // console.log(value, ' = ', val)
              arrayOfTruth.push(true);
            }
          });
        }
      });
    }

    let errorType
    // If refresh initialized, or session data is different from what was previously 
    // searched then search for new appointments
    if (
      $getUser("refreshAppointments") ||
      !sessionData ||
      sessionData.dateWeek !== date ||
      sessionData.specificDate !== specificDate ||
      arrayOfTruth.length !== paramsValues.length
    ) {
      console.log('get appointments from workflow')
      console.log(payload)


      // Send payload and call worfklow which will retrieve the 
      // appts from compucare

      d = await $vm.$wfGetData("-MZ3oqJ0NFSKdLm2zqn-", payload);
      console.log('result from get appts is, ', d)
      //check for issues with designated 
      
      if (!d.appointments || !d.appointmentsSorted || !d.appointmentsSorted[0]){
        // there are no appointments, tell the user why
        let errorMessage = 'No available appointments, please try a different date range.'
        
        if (parseInt(d.clinicCountNonDesignated) > 0 && parseInt(d.clinicCountDesignated) < 1){
          console.log('running here')
          errorMessage = 'This consultant does match the requested criteria but is not NPE designated so please contact the practice manager.'
          errorType = 'override'
          $vm.$set($vm.globalModels, "overrideMsg", true)
        }


        else if (d.clinicCountNonDesignated == 0 && d.clinicCountNonDesignated == 0){
          errorMessage = 'This consultant has no solutions matching the requested criteria.'
        }
        
          
          $vm.$set($vm.globalModels, "appointmentsError", errorMessage)
          $vm.$set($vm.globalModels, "appointments", []);
          $vm.$set($vm.globalModels, "appointmentsLoaded", true);
        

        console.log('error is', errorMessage)

      }
      else if (d instanceof Error) {
        console.error(d);

        $vm.$set($vm.globalModels, "appointmentsError", d.message);
        $vm.$set($vm.globalModels, "appointments", []);

        return;
      }      
      // Set session storage last inputs
      sessionStorage.getAppointments = JSON.stringify({
        dateWeek: date,
        specificDate: specificDate,
        paramsValues: paramsValues,
        data: d,
      });
    } else {
      d = sessionData.data;
    }


    if(d.appointments){
      try {
        if (Object.values(d).length > 0) {
          // Check for daylight saving hours
          d.appointmentsSorted.forEach(appointment => {
            let startDate = moment(appointment.Start)
            let endDate = moment(appointment.End)

            if(startDate.isDST()){
              let startDateOffset = new Date(startDate.utcOffset(60)._d)
              startDateOffset = new Date(startDateOffset.setHours(startDateOffset.getHours() - 1))
              startDateOffset = startDateOffset.toISOString().split('.')[0]
              appointment.StartOffset = startDateOffset
            } else {
              appointment.StartOffset = appointment.Start
            }

            if(endDate.isDST()){
              let endDateOffset = new Date(endDate.utcOffset(60)._d)
              endDateOffset = new Date(endDateOffset.setHours(endDateOffset.getHours() - 1))
              endDateOffset = endDateOffset.toISOString().split('.')[0]
              appointment.EndOffset = endDateOffset
            } else {
              appointment.EndOffset = appointment.End
            }
          })
          
          // Filter out some Appts by Options set by Moorfields
          let filteredAppointments = d.appointmentsSorted.filter(row => {
            return ($getUser('onlyVisualFields') ? 
                (row.clinic.Clinic_ID__c === '150' || row.clinic.Clinic_ID__c === '131' || row.clinic.Clinic_ID__c === '295' || row.clinic.Clinic_ID__c === '299' || row.clinic.Clinic_ID__c === '308')
                :
                (row.clinic.Clinic_ID__c !== '150' && row.clinic.Clinic_ID__c !== '131'  && row.clinic.Clinic_ID__c !== '295'  && row.clinic.Clinic_ID__c !== '299'  && row.clinic.Clinic_ID__c !== '308')
                ) && $getUser('locations') && ((row.clinic.Clinic_ID__c == 150 || row.clinic.Clinic_ID__c == 131  || row.clinic.Clinic_ID__c == 295     || row.clinic.Clinic_ID__c == 299      || row.clinic.Clinic_ID__c == 308   )?true:($getUser('locations').includes(row.clinic.locationName))) && row.BookingStatus == 0 && row.SlotType !== 'S' && $getUser('locations').includes(row.clinic.locationName) && row.SessionId
          })

          console.log('filteredAppts are, ', filteredAppointments)

          if(filteredAppointments.length < 1 && !errorType) {
            let errorMessage = 'No available appointments, please try a different date range.'
            console.log('error is', errorMessage)
            $vm.$set($vm.globalModels, "appointmentsError", errorMessage)
            $vm.$set($vm.globalModels, "appointments", []);
            $vm.$set($vm.globalModels, "appointmentsLoaded", true);
            return
          }

          // Get all dates in the appointment list that will be showed as buttons
          // For filtering by date
          const dates = filteredAppointments.map((appointment) => {
            return appointment.Start.split("T")[0];
          });

          // Get only unique dates
          const uniqueDates = [...new Set(dates)];
          // Sort the dates
          uniqueDates.sort((a, b) => {
            a = a.split("/").join("");
            b = b.split("/").join("");
            return a > b ? 1 : a < b ? -1 : 0;
          });

          // Map dates to appointments
          let appointmentsByDate = uniqueDates.map((date) => {
            return {
              date: date,
              appointments: 0,
            };
          });


          // Count the appointments for each date
          appointmentsByDate.forEach((date) => {
            filteredAppointments.forEach((appointment) => {
              if (appointment.Start.split("T")[0] === date.date) {
                date.appointments++;
              }
            });
          });

          let compareArray = [];
          if ($getUser("datesToShow")) {
            $getUser("datesToShow").forEach((el) => {
              uniqueDates.forEach((date) => {
                if (el === date) {
                  compareArray.push("true");
                } else {
                  compareArray.push("false");
                }
              });
            });

            if (compareArray.includes("false")) {
              if (
                !$getUser("datesToNotShow") ||
                $getUser("datesToNotShow").length == 0
              ) {
                $setUser("datesToShow", uniqueDates);
              }
            }
          }

          if (!$getUser("datesToShow") && !$getUser("datesToNotShow")) {
            $setUser("datesToShow", uniqueDates);
          }


          d.days = appointmentsByDate;
          $setUser("refreshAppointments", false);
        }
      } catch (error) {
        console.error(error);

        d.days = {};
      }
    }

    // Set appointments to the global model so they will show up
    // in the UI
    $vm.$set($vm.globalModels, "appointments", [d]);
    $vm.$set($vm.globalModels, "appointmentsLoaded", true);
  } catch (err) {
    console.error(err);
    $vm.$set($vm.globalModels, "appointmentsLoaded", true);
    $vm.$set($vm.globalModels, "appointmentsError", err.message);
    $vm.$set($vm.globalModels, "appointments", []);
  }
};