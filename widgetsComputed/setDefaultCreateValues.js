return () => {
    const params = new URLSearchParams(location.search);
    console.log(params)
    if(params.get('firstName')) {
        $setUser('firstName', params.get('firstName'))
        this.models.firstName = params.get('firstName')
    }
    else if ($getUser('firstName')){
        this.models.firstName = $getUser('firstName')
    }

    if(params.get('lastName')) {
        console.log('last name query string found')
        $setUser('lastName', params.get('lastName'))
        this.models.lastName = params.get('lastName')
    
    }
    else if ($getUser('lastName')){
        console.log('last name user model found set it')
        this.models.lastName = $getUser('lastName')
    
    }

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
}