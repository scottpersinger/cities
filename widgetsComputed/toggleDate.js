return function(date, operation) {
    const dates = $getUser('datesToShow')
    let removedDates = $getUser('datesToNotShow')

    if(!removedDates){
        removedDates = []
    }

    if(operation == 'remove'){   
        let index
        dates.forEach(el => {
            if(el == date){
                index = dates.indexOf(el)
            }
        })

        dates.splice(index, 1)

        if(dates.length == 0){
            dates.push('empty')
        }

        removedDates.push(date)
        $setUser('datesToNotShow', removedDates)

        $setUser('datesToShow', dates)
    }else{
        let index
        removedDates.forEach(el => {
            if(el == date){
                index = dates.indexOf(el)
            }
        })

        removedDates.splice(index, 1)

        $setUser('datesToNotShow', removedDates)

        dates.push(date)

        $setUser('datesToShow', dates)
    }
    

}