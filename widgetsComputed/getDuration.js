return function(start, end) {
    const startDate = new Date(start)
    const endDate = new Date(end)
    
    const diff = endDate - startDate

    const minutes = Math.floor((diff/1000)/60)

    return minutes
}