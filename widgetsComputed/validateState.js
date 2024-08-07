return function(stateType) {
    if(stateType === 'name'){
        let name = $getUser('firstName') || ''
        if (name && name.length < 2) {
            return false
        } else {
            let nameRegExp = new RegExp("^([A-z]+[,.]?[ ]?|[A-z]+['-]?)+$")
            let firstNameTest = nameRegExp.test(name)

            return firstNameTest
        }
    } else if(stateType === 'lastName') {
        let lastName = $getUser('lastName') || ''
        if(lastName && lastName.length < 3) {
            return false
        } else {
            let nameRegExp = new RegExp("^([A-z]+[,.]?[ ]?|[A-z]+['-]?)+$")
            let lastNameTest = nameRegExp.test(lastName)

            return lastNameTest
        }
    } else if(stateType === "streetAddress") {
        let streetAddress = $getUser('createAddress') || '' 
        if (streetAddress.length < 3) {
            return false
        } else {
            return true
        }
    } else if(stateType === 'createCity') {
        let createCity = $getUser('createCity')  || ''
        if(createCity && createCity.length > 0) {
            let cityRegExp = new RegExp("^[a-zA-Z]+(?:[\s-][a-zA-Z]+)*$")
            let cityTest = cityRegExp.test(createCity)
            return cityTest
        } else {
            return true
        }
    } else if(stateType === 'address2') {
        let address2 = $getUser('createAddress2')  || ''
        if(address2 && address2.length > 0) {
            return true
        } else {
            return true
        }
    } else if(stateType === 'createCounty') {
        let county = $getUser('createCounty')  || ''
        if(county && county.length > 0) {
            let countyRegExp = new RegExp("^[a-zA-Z ]*$")
            let countyTest = countyRegExp.test(county)
            return countyTest
        } else {
            return true
        }
    } else if(stateType === 'createCountry') {
        let country = $getUser('createCountry')  || ''
        if(country && country.length > 0) {
            let countryRegExp = new RegExp("^[a-zA-Z]+(?:[\s-][a-zA-Z]+)*$")
            let countryTest = countryRegExp.test(country)
            return countryTest
        } else {
            return true
        }
    } else if(stateType === 'createPostCode') {
        let postCode = $getUser('createPostCode')  || ''
        if(postCode && postCode.length > 0) {
            if(postCode.length <= 8 && postCode.length >= 6){
                return true
            } else {
                return false
            }
        } else {
            return true
        }
    } else if(stateType === 'createSalutation') {
        let salutation = $getUser('createSalutation')  || ''
        if(salutation && salutation.length > 0) {
            salutationRegExp = new RegExp('^[a-zA-Z]+$')
            let salutationTest = salutationRegExp.test(salutation)
            return salutationTest
        } else {
            return true
        }
    } else if(stateType === 'createMobile') {
        let mobile = $getUser('createMobile')  || ''
        if(mobile && mobile.length > 0) {
            mobile = mobile.replace(/\s/g,'')
            if(mobile.length !== 11){
                return false
            }
            let mobileStart = mobile.substring(0, 2)
            
            if(mobileStart !== '07'){
                return false
            } else {
                return true
            }
        } else {
            return true 
        }
    } else if(stateType === 'createEmail') {
        let email = $getUser('createEmail')  || ''
        if(email && email.length > 0){
            let emailRegExp = new RegExp("[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?")
            let emailTest = emailRegExp.test(email)
            return emailTest
        } else {
            return true
        }
    } else if(stateType === 'createHome') {
        let home = $getUser('createHome')  || ''
        if(home && home.length > 0) {
            home = home.replace(/\s/g,'')
            if(home.length !== 11){
                return false
            }
            let homeStart = home.substring(0, 2)
            if(homeStart !== '01' && homeStart !== '02' && homeStart !== '03'){
                return false
            } else {
                return true
            }
        } else {
            return true
        }
    } else if(stateType === 'createDob') {
        let dob = $getUser('createDob')

        let dobTest = moment(dob, 'DD/MM/YYYY', true).isValid()
        return dobTest
    } else if(stateType === 'createInternationalPhone') {
        let phone = $getUser('createInternationalPhone')  || ''
        if(phone && phone.length > 0) {
            if(phone.length > 15){
                return false
            } else if(phone.length < 3){
                return false
            } else if(phone[0] != '+'){
                return false
            } else if(!(/^\d+$/.test(phone.substr(1)))) {
                return false
            } else {
                return true
            }
        } else {
            return true
        }
    }
    
    if(stateType === 'editFirstName'){
        let name = $getUser('editFirstName')  || ''
        if (name && name.length < 2) {
            return false
        } else {
            let nameRegExp = new RegExp("^([A-z]+[,.]?[ ]?|[A-z]+['-]?)+$")
            let firstNameTest = nameRegExp.test(name)

            return firstNameTest
        }
    } else if(stateType === 'editLastName') {
        let lastName = $getUser('editLastName')  || ''
        if(lastName && lastName.length < 3) {
            return false
        } else {
            let nameRegExp = new RegExp("^([A-z]+[,.]?[ ]?|[A-z]+['-]?)+$")
            let lastNameTest = nameRegExp.test(lastName)

            return lastNameTest
        }
    } else if(stateType === "editAddress") {
        let streetAddress = $getUser('editAddress')  || ''
        if (streetAddress && streetAddress.length < 3) {
            return false
        } else {
            return true
        }
    } else if(stateType === 'editCity') {
        let createCity = $getUser('editCity')  || ''
        if(createCity && createCity.length > 0) {
            let cityRegExp = new RegExp("^[a-zA-Z]+(?:[\s-][a-zA-Z]+)*$")
            let cityTest = cityRegExp.test(createCity)
            return cityTest
        } else {
            return true
        }
    } else if(stateType === 'editAddress2') {
        let address2 = $getUser('editAddress2')  || ''
        if(address2 && address2.length > 0) {
            return true
        } else {
            return true
        }
    } else if(stateType === 'editCounty') {
        let county = $getUser('editCounty')  || ''
        if(county && county.length > 0) {
            let countyRegExp = new RegExp("^[a-zA-Z ]*$")
            let countyTest = countyRegExp.test(county)
            return countyTest
        } else {
            return true
        }
    } else if(stateType === 'editCountry') {
        let country = $getUser('editCountry')  || ''
        if(country && country.length > 0) {
            let countryRegExp = new RegExp("^[a-zA-Z]+(?:[\s-][a-zA-Z]+)*$")
            let countryTest = countryRegExp.test(country)
            return countryTest
        } else {
            return true
        }
    } else if(stateType === 'editPostCode') {
        let postCode = $getUser('editPostCode')  || ''
        if(postCode && postCode.length > 0) {
            if(postCode.length <= 8 && postCode.length >= 6){
                return true
            } else {
                return false
            }
        } else {
            return true
        }
    } else if(stateType === 'editSalutation') {
        let salutation = $getUser('editSalutation')  || ''
        if(salutation && salutation.length > 0) {
            salutationRegExp = new RegExp('^[a-zA-Z]+$')
            let salutationTest = salutationRegExp.test(salutation)
            return salutationTest
        } else {
            return true
        }
    } else if(stateType === 'editMobile') {
        let mobile = $getUser('editMobile')  || ''
        if(mobile && mobile.length > 0) {
            mobile = mobile.replace(/\s/g,'')
            if(mobile.length !== 11){
                return false
            }
            let mobileStart = mobile.substring(0, 2)
            
            if(mobileStart !== '07'){
                return false
            } else {
                return true
            }
        } else {
            return true 
        }
    } else if(stateType === 'editEmail') {
        let email = $getUser('editEmail')  || ''
        if(email && email.length > 0){
            let emailRegExp = new RegExp("[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?")
            let emailTest = emailRegExp.test(email)
            return emailTest
        } else {
            return true
        }
    } else if(stateType === 'editHome') {
        let home = $getUser('editHomePhone')  || ''
        if(home && home.length > 0) {
            home = home.replace(/\s/g,'')
            if(home.length !== 11){
                return false
            }
            let homeStart = home.substring(0, 2)
            if(homeStart !== '01' && homeStart !== '02' && homeStart !== '03'){
                return false
            } else {
                return true
            }
        } else {
            return true
        }
    } else if(stateType === 'editDob') {
        let dob = $getUser('editDOB')

        let dobTest = moment(dob, 'DD/MM/YYYY', true).isValid()
        return dobTest
    } else if(stateType === 'editInternationalPhone') {
        let phone = $getUser('editInternationalPhone')  || ''
        if(phone && phone.length > 0) {
            if(phone.length > 15){
                return false
            } else if(phone.length < 3){
                return false
            } else if(phone[0] != '+'){
                return false
            } else if(!(/^\d+$/.test(phone.substr(1)))) {
                return false
            } else {
                return true
            }
        } else {
            return true
        }
    }
}