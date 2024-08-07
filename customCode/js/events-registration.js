setTimeout(() => {
    if ($vm.currentTab === '-MWZUnL0Mw7L_6bo6jKO') getAppointments()
    $vm.$bus.$off('onPageVisit-MWZUnL0Mw7L_6bo6jKO')
    $vm.$bus.$on('onPageVisit-MWZUnL0Mw7L_6bo6jKO', () => {
        console.log('get some', $vm.globalModels.appointmentsLoaded)
        if (!$vm.globalModels.appointmentsLoaded) getAppointments()
    })
})

setTimeout(() => {
    if ($vm.currentTab === '-MWP_CXNtUXW4MBilXHZ') getPatients()
    $vm.$bus.$off('onPageVisit-MWP_CXNtUXW4MBilXHZ')
    $vm.$bus.$on('onPageVisit-MWP_CXNtUXW4MBilXHZ', () => {
        console.log('get some', $vm.globalModels.patientsLoaded)
       // if (!$vm.globalModels.patientsLoaded) 
        
        getPatients()
    })
})


