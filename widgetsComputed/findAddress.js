return async function(edit) {
    let postCode
    if(!edit){
        postCode = $getUser('createPostCode')
    } else {
        postCode = $getUser('editPostCode')
    }
    
    let api_key = 'YbZA98Ekek61y-IYZ8BR3Q33192'
    
    let url = `https://api.getAddress.io/find/${postCode}?api-key=${api_key}&expand=true`

    let response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })



    response = await response.json()
    console.log(response)
    $setUser('addressesObjects', response.addresses)
    response = response.addresses.map(address => {
        return address.line_1 + `${address.line_2 ? ', ' : ''}` + address.line_2 + `${address.line_3 ? ', ' : ''}` + address.line_3
    })
    $setUser('addressesFound', response)
}