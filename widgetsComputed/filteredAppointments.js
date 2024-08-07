return function(appointments) {
    // If visual fields appointment then filter by no earlier than 9am
    // and the same day.
    let requiredVisualTestFilterFields = {
      onlyVisualFields: $getUser('onlyVisualFields'),
      solutionId: $getUser('solutionId'),
      time: $getUser('time'),
      date: $getUser('date'),
      location: $getUser('location'),
    };
    let hasEveryRequriedVisualTestField = Object.keys(requiredVisualTestFilterFields)
      .every(key => !!requiredVisualTestFilterFields[key]);
    if(hasEveryRequriedVisualTestField) {
      appointments = appointments.filter(appt => {
        let start = moment(appt.Start);
        let glaucomaTestTime = requiredVisualTestFilterFields['time'];
        let glaucomaTestDate = requiredVisualTestFilterFields['date'];  
        let glaucomaTestLocation = requiredVisualTestFilterFields['location'];

        let glaucomaTestDateTime = moment(
          glaucomaTestDate + ' ' + glaucomaTestTime,
          'DD-MM-YYYY hh:mm'
        );

        // console.log('glaucomaTestTime', glaucomaTestTime);
        // console.log('glaucomaTestDate', glaucomaTestDate);
        // console.log('glaucomaTestLocation', glaucomaTestLocation);
        // console.log('glaucomaTestDateTime', glaucomaTestDateTime);

        let startMinutes = (start.hour() * 60) + start.minute();
        let startMinutesGlt = (glaucomaTestDateTime.hour() * 60) + glaucomaTestDateTime.minute();

        let startAfter9Am = start.hour() >= 9;
        let atLeast30MinutesBefore = startMinutes <= startMinutesGlt - 30;
        let atMost120MinutesBefore = startMinutes >= startMinutesGlt - 120;
        let onSameDate = start.format('YYYY-MM-DD') == glaucomaTestDateTime.format('YYYY-MM-DD');
        let locationTheSame = (appt.clinic ? appt.clinic.locationName : null) == glaucomaTestLocation;

        return startAfter9Am && 
              atLeast30MinutesBefore &&
              atMost120MinutesBefore &&
              onSameDate &&
              locationTheSame;
      });
    }
    return appointments
}