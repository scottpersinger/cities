return function (time){

    const dateTime = time.split('T')[1]
    const hours = dateTime.split(':')[0]
    const ampm = hours >= 12 ? 'PM' : 'AM'
    return ampm
}
