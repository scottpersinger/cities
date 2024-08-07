async function fetchCancellationReasons() {
    let data = await $vm.$wfGetData('-NO0mhEBODa4JhkYHEgh', {});
    if(!data || !data.reasons) {
        $setUser('cancellationError', 'Unable to fetch cancellation reasons.');
        return;
    }

    let reasons, codesToSkip = ['01', '05', '07', '08', 'CM', 'CO', 'HC', 'SS', 'ZZ']
    if(data && data.reasons && data.reasons.length > 0) {
        reasons = data.reasons.filter(reason => {
            if(codesToSkip.includes(reason.Code)) {
                return false
            } else {
                return true
            }
        })
    }

    $vm.globalModels.cancellationReasons = reasons ? reasons : data.reasons;
}

function bookingMatchesConversion(booking, conversion) {
    let bookingDate = moment.utc(booking.StartDate);
    let bookingTime = booking.Time;
    let conversionDate = moment.utc(conversion.Appointment_Date_and_Time__c);


    console.log(bookingDate.format('YYYY-MM-DD'), conversionDate.format('YYYY-MM-DD'))

    console.log(bookingTime, conversionDate.format('HH:mm'))

    if(bookingDate.format('YYYY-MM-DD') !== conversionDate.format('YYYY-MM-DD')) {
        return false;
    }

    // if(bookingTime !== conversionDate.format('HH:mm')) {
    //     return false;
    // }

    if(!booking.Patient) {
        return false;   
    }

    let bookingPxName = booking.Patient.Title + ' ' + booking.Patient.GivenNames + ' ' + booking.Patient.FamilyName;
    let conversionPxName = conversion.Patient_Name__c;

    if(!conversionPxName || conversionPxName.trim().toLowerCase() != bookingPxName.trim().toLowerCase()) {
        return false;
    }

    let bookingPxDob = moment(booking.Patient.DateOfBirth);
    let conversionPxDob = moment(conversion.Date_of_Birth__c || conversion.DateOfBirth__c);

    if(bookingPxDob.format('YYYY-MM-DD') != conversionPxDob.format('YYYY-MM-DD')) {
        return false;
    }

    return true;
}

async function fetchBooking(bookingID, conversionID) {
    $setUser('isBookingCancellable', false);
    let data = null;
    try {
        $setUser('loadingBookingData', true);
        data = await $vm.$wfGetData('-NO15ST_9apVzuQNbkTf', {
            bookingID: bookingID,
            conversionID: conversionID,
        });
    } finally {
        $setUser('loadingBookingData', false);
    }
    console.log('fetched data is', data);
    if(!data || !data.booking) {
        $setUser('cancellationError', 'Booking could not be fetched.');
        return;
    }
    if(!data.conversion) {
        $setUser('cancellationError', 'Conversion could not be fetched.');
        return;
    }
    if(!bookingMatchesConversion(data.booking, data.conversion)) {
        $setUser('cancellationError', 'Booking has changed, please cancel booking in Compucare.');
        return;
    }
    $setUser('isBookingCancellable', true);
    data.booking.bookingID = bookingID;
    $vm.globalModels.booking = data.booking;
}

window.cancelBooking = async function() {
    console.log('Refetch booking...');
    try {
        $setUser('loadingBookingData', true);
        await fetchBooking(bookingID, conversionID);

    } finally {
        $setUser('loadingBookingData', false);
    }

    if(!$getUser('isBookingCancellable')) {
        console.log('Unable to cancel.');
        return;
    }

    console.log('Cancelling booking...');
    $setUser('cancellationError', null);
    let cancellationReasonSelected
    if($getUser('cancellationReason') == null) {
        return;
    } else {
        cancellationReasonSelected = $getUser('cancellationReason')
    }

    let data = await $vm.$wfGetData('-NO0yLwJl10ng2XH4kTi', {
        bookingID: bookingID,
        conversionID: conversionID,
        cancellationReason: cancellationReasonSelected ? cancellationReasonSelected : ''
    }); 

    console.log(data);
    if(!data || !data.success) {
        $setUser('cancellationError', 'Unable to cancel booking.');
        return;
    }
    $setUser('cancellationSuccess', true);
    $setUser('isBookingCancellable', false);
}
 
const params = new URLSearchParams(location.search);
console.log(params);
const bookingID = params.get('bookingID');
const conversionID = params.get('conversionId');

$setUser('isBookingCancellable', false);
$setUser('cancellationReason', null);
$setUser('cancellationSuccess', false);
$setUser('cancellationError', null);
$setUser('loadingBookingData', false);



console.log('Conversion ID is, ', conversionID)
 
if(bookingID) {
    $vm.globalModels.cancellationReasons = [];
    $vm.globalModels.cancellationError = null;
    fetchBooking(bookingID, conversionID);
    fetchCancellationReasons();
}