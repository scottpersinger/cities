var myParam = location.search.split('mobile=')[1]

const params = new URLSearchParams(location.search);

console.log('params are', params)

if(params.get('bookingID')) {
    console.log('booking id is ', params.get('bookingID'));
    $setCurrentTab('-MWPZltjqNSSXj8nRL0y', {
        bookingId: params.get('bookingID'),
    });
}

if(params.get('userId')) {
    $setUser('paramsUserId', params.get('userId'))
}


if(params.get('firstName')) {
    $setUser('firstName', params.get('firstName'))
    $vm.$set($vm.models, "firstName", params.get('firstName'))
}
else if ($getUser('firstName')){
    //$vm.$set($vm.models, "firstName", $getUser('firstName'))
    $vm.$set($vm.models, "firstName", '')
}

if(params.get('lastName')) {
    console.log('last name query string found')
    $setUser('lastName', params.get('lastName'))
    $vm.$set($vm.models, "lastName", params.get('lastName'))
} else {
    $vm.$set($vm.models, "lastName", "")
}



if(params.get('dob')) {
    console.log('last name query string found')
    $setUser('dob', params.get('dob'))
    $vm.$set($vm.models, "dob", params.get('dob'))
}

if(params.get('gender')) {
    console.log('setting gender, ', params.get('gender'))
    if(params.get('gender') == 'Not Specified') {
        $setUser('searchSex', 'Other')
    } else {
        $setUser('searchSex', params.get('gender'))
    }

    
}

if ($getUser('lastName')){
     console.log('last name user model found set it')
    $vm.$set($vm.models, "lastName", $getUser('lastName'))
}

if ($getUser('dob')){
     console.log('dob found set it')
    $vm.$set($vm.models, "dob", $getUser('dob'))
  
}

if(params.get('consultant')){
    $setUser('paramsConsultant', params.get('consultant').trim())
} else {
    $setUser('paramsConsultant', '')
}

$setUser('insurer', params.get('insurer'))
$setUser('conditionFinal', params.get('conditionFinal'))
$setUser('condition', params.get('condition'))
$setUser('speciality', params.get('speciality'))

if(params.get('mobile')){
    $setUser('createMobile', params.get('mobile'))
} else {
    $setUser('createMobile', '')
}
if(params.get('email')){
    $setUser('createEmail', params.get('email'))
} else {
    $setUser('createEmail', '')
}


$setUser('conversionId', params.get('conversionId'))


//$setUser('mobile', myParam)


// check if $getUser('locations') has a value and if not set it to the array of locations

if(!$getUser('locations')) {
   $setUser('locations', ['Bedford', 'Moorfields Private Outpatient Centre','New Cavendish Street','Northwick Park','Purley',`Richard Desmond Children's Eye Centre`])
}

if(!$getUser('am')) {
    $setUser('am', ['AM', 'PM', 'NULL'])
}

// if no dateweek or no specific date, set dateweek to week from today

if(!$getUser('dateWeek') && !$getUser('specificDate')) {
    const dateToday = new Date().toISOString().split('T')[0]

    $setUser('dateWeek', dateToday)
}

if(!$getUser('datesToNotShow')){
    $setUser('datesToNotShow', [])
}

// Reset Values on page reload
$setUser('bookingFinished', false)
$setUser('failedBooking', false)
$setUser('successfulBooking', false)
$setUser('noPatientsFound', false)
$setUser('loadingBooking', false)
$setUser('patientCreated', false)
$setUser('patientEdited', false)
$setUser('validationAlert', '')
$setUser('editError', '')
$setUser('creationError', '')
$setUser('showCreatePatient', false)
$setUser('patientEdit', false)

$setUser('bookingID', '')
$setUser('bookingDateTime', '')
$setUser('visualBookingID', '')
$setUser('visualBookingDateTime', '')
$setUser('bookingPatientId', '')
$setUser('dob', '')

//this.getPatients(true)

$('#panel').scrollTop(0)

  let paramsWin = Object.fromEntries(new URLSearchParams(location.search));

//   if(!paramsWin || !paramsWin.userId) {
//     alert('You are not a verified salesforce user')

//     location.assign("https://moorfields-npe-platform.web.app")
//   }
