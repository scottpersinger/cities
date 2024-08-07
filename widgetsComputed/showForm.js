return async function(formType){
    if(formType == 'create'){
        $setUser('showCreatePatient', true);
        $setUser('noPatientsFound', false);
        $setUser('patientEdit', false)

        $('#panel').scrollTop($('#widget-MZWwEn6_JgXEj_uDPGQ')[0].offsetTop)
    }
}