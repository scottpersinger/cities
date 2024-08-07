return async function(e, edit) {
    let addressesObjects = $getUser('addressesObjects')
    if(!edit){
        addressesObjects.forEach(addressObject => {
            if(addressObject.line_1 + `${addressObject.line_2 ? ', ' : ''}` + addressObject.line_2 + `${addressObject.line_3 ? ', ' : ''}` + addressObject.line_3 === e) {
                $setUser('createAddress', addressObject.line_1 + `${addressObject.line_2 ? ', ' : ''}` + addressObject.line_2 + `${addressObject.line_3 ? ', ' : ''}` + addressObject.line_3)
                $setUser('createAddress2', addressObject.building_number + ' ' + addressObject.thoroughfare)
                $setUser('createCity', addressObject.town_or_city)
                $setUser('createCounty', addressObject.county)
                $setUser('createCountry', addressObject.country)
            }
        })
    } else {
        addressesObjects.forEach(addressObject => {
            if(addressObject.line_1 + `${addressObject.line_2 ? ', ' : ''}` + addressObject.line_2 + `${addressObject.line_3 ? ', ' : ''}` + addressObject.line_3 === e) {
                $setUser('editAddress', addressObject.line_1 + `${addressObject.line_2 ? ', ' : ''}` + addressObject.line_2 + `${addressObject.line_3 ? ', ' : ''}` + addressObject.line_3)
                $setUser('editAddress2', addressObject.building_number + ' ' + addressObject.thoroughfare)
                $setUser('editCity', addressObject.posttown)
                $setUser('editCounty', addressObject.county)
                $setUser('editCountry', 'UK')
            }
        })
    }
}