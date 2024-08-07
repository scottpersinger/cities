


<pre 
style="max-height:100px"
>

</pre>
<!-- Create Patient Form -->
<div class="card m-2" style="padding: 20px 0"
  v-if="$getUser('showCreatePatient')">

  <div class="row">
    <div class="column col-12 col-sm-12 col-lg-12" style="margin-top: 20px;" v-if="$getUser('patientError')">
      <b-alert variant="danger" show v-if="$getUser('creationError')">New patient couldn't be created because: {{$getUser('errorMessage')}}</b-alert>
      <b-alert variant="danger" show v-if="$getUser('editError')">The patient couldn't be edited because: {{$getUser('errorMessage')}}</b-alert>
    </div>
  </div>


  <div class="row" id="createPatientForm">
    <h3 style="padding-left: 15px">Create Patient</h3>
  </div>
  <b-form @submit.stop.prevent="createPatient">

    <div class="row" v-if="$getUser('addressNotFound')">
            <b-alert style="width: 100%;" variant="danger" show>An address could not be found using this post code</b-alert>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="firstNameInputGroup" label="First Name" label-for="firstName">
            <b-form-input
              id="firstName"
              name="firstName"
              size="sm"
              v-model="$userData('firstName').bind"
              :state="validateState('name')"
              aria-describedby="firstNameFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="firstNameFeedback"
            >This is a required field that must be at least 2 characters long and be a valid name.</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="lastNameInputGroup" label="Last Name" label-for="lastName">
            <b-form-input
              id="lastName"
              name="lastName"
              size="sm"
              v-model="$userData('lastName').bind"
              :state="validateState('lastName')"
              aria-describedby="lastNameFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="lastNameFeedback"
            >This is a required field that must be at least 2 characters long and be a valid last name.</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createPostCodeInputGroup" label="Post Code" label-for="createPostCode">
            <b-form-input
              id="createPostCode"
              name="createPostCode"
              size="sm"
              v-model="$userData('createPostCode').bind"
              :state="validateState('createPostCode')"
              aria-describedby="createPostCodeFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="createPostCodeFeedback"
            >Post Code must be between 6 and 8 characters long (including spaces)</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
      <div class="column col-3 col-lg-3" style="display: flex; align-items: flex-end; padding-bottom: 0;">
        <b-button @click="findAddress()" size="sm" variant="success">Find Address</b-button>
      </div>
    </div>
    <div class="row" v-if="$getUser('addressesFound')">
      <div class="column col-12 col-lg-12" style="padding-left: 8px; padding-right: 8px;">
        <v-select 
        @input="setAddress($event)" 
        name="addressesFound" 
        id="addressesFound" 
        class="addressesFound" 
        :options="$getUser('addressesFound')"
        ></v-select>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="streetAddressInputGroup" label="Street Address" label-for="streetAddress">
            <b-form-textarea
              id="streetAddress"
              name="streetAddress"
              size="sm"
              v-model="$userData('createAddress').bind"
              :state="validateState('streetAddress')"
              aria-describedby="streetAddressFeedback"
            ></b-form-textarea>
            <b-form-invalid-feedback
              id="streetAddressFeedback"
            >This is a required field that must be at least 3 characters.</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>      
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="address2InputGroup" label="Address 2" label-for="address2">
            <b-form-textarea
              id="address2"
              name="address2"
              size="sm"
              v-model="$userData('createAddress2').bind"
              :state="validateState('address2')"
              aria-describedby="address2Feedback"
            ></b-form-textarea>
            <b-form-invalid-feedback
              id="address2Feedback"
            >Please enter a valid address</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createCityInputGroup" label="City" label-for="createCity">
            <b-form-input
              id="createCity"
              name="createCity"
              size="sm"
              v-model="$userData('createCity').bind"
              :state="validateState('createCity')"
              aria-describedby="createCityFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="createCityFeedback"
            >Please enter a valid city name</b-form-invalid-feedback>
          <b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createCountyInputGroup" label="County" label-for="createCounty">
            <b-form-input
              id="createCounty"
              name="createCounty"
              size="sm"
              v-model="$userData('createCounty').bind"
              :state="validateState('createCounty')"
              aria-describedby="createCountyFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="createCountyFeedback"
            >Please enter a valid county</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createCountryInputGroup" label="Country" label-for="createCountry">
            <b-form-input
              id="createCountry"
              name="createCountry"
              size="sm"
              v-model="$userData('createCountry').bind"
              :state="validateState('createCountry')"
              aria-describedby="createCountryFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="createCountryFeedback"
            >Please enter a valid country</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createSex" label="Select Gender" label-for="createSex">
            <b-form-select
              id="createSex"
              name="createSex"
              size="sm"
              v-model="$userData('createSex').bind"
              :options="['Female', 'Male', 'Other']"
            ></b-form-select>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createSalutationInputGroup" label="Salutation" label-for="createSalutation">
            <b-form-input
              id="createSalutation"
              name="createSalutation"
              size="sm"
              v-model="$userData('createSalutation').bind"
              :state="validateState('createSalutation')"
              aria-describedby="createSalutationFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="createSalutationFeedback"
            >Please enter a valid salutation</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createMobileInputGroup" label="Mobile" label-for="createMobile">
            <b-form-input
              id="createMobile"
              name="createMobile"
              size="sm"
              v-model="$userData('createMobile').bind"
              :state="validateState('createMobile')"
              aria-describedby="createMobileFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="createMobileFeedback"
            >Mobile number must be 11 digits long and start with 07</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createEmailInputGroup" label="Email" label-for="createEmail">
            <b-form-input
              id="createEmail"
              name="createEmail"
              size="sm"
              v-model="$userData('createEmail').bind"
              :state="validateState('createEmail')"
              aria-describedby="createEmailFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="createEmailFeedback"
            >Please enter a valid email</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createHomeInputGroup" label="Home" label-for="createHome">
            <b-form-input
              id="createHome"
              name="createHome"
              size="sm"
              v-model="$userData('createHome').bind"
              :state="validateState('createHome')"
              aria-describedby="createHomeFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="createHomeFeedback"
            >Home number must be 11 digits long and start with 01, 02, or 03</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="createDobInputGroup" label="Date of Birth" label-for="createDob">
            <b-form-input
              id="createDob"
              name="createDob"
              size="sm"
              v-model="$userData('createDob').bind"
              :state="validateState('createDob')"
              aria-describedby="createDobFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
              id="createHomeFeedback"
            >Date of birth is a required field and must be of format DD-MM-YYYY</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-lg-3 col-sm-5 col-6">
        <b-button style="width: 100%; font-size: 0.6em;" type="submit" variant="primary">Create</b-button>
      </div>
      <div class="column col-lg-3 col-sm-5 col-6">
        <b-button style="width: 100%; font-size: 0.6em;" class="ml-2" 
        @click="$setUser('showCreatePatient', false); resetValues() ;$set(globalModels, 'loadingPatients', true); $set(globalModels, 'patientSearchApplied', true); $('#panel').scrollTop(0); $setUser('addressesFound', [])">Cancel</b-button>
      </div>
    </div>
</div>

<!-- End Of Create Patient Form -->

<!-- Edit Patient Form -->
<div class="card m-2" style="padding: 20px 0"
  v-if="$getUser('patientEdit')">
  <div class="row">
    <div class="column col-12 col-sm-12 col-lg-12" style="margin-top: 20px;" v-if="$getUser('patientError')">
      <b-alert variant="danger" show v-if="$getUser('creationError')">New patient couldn't be created because: {{$getUser('errorMessage')}}</b-alert>
      <b-alert variant="danger" show v-if="$getUser('editError')">The patient couldn't be edited because: {{$getUser('errorMessage')}}</b-alert>
    </div>
  </div>
  <div class="row">
    <h3 style="padding-left: 15px">Edit Patient</h3>
  </div>
  <div class="row" v-if="$getUser('addressNotFound')">
          <b-alert style="width: 100%;" variant="danger" show>An address could not be found using this post code</b-alert>
  </div>
  <b-form @submit.stop.prevent="editPatient">
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editFirstNameInputGroup" label="First Name" label-for="editFirstName">
            <b-form-input
              id="editFirstName"
              name="editFirstName"
              disabled
              size="sm"
              v-model="$userData('editFirstName').bind"
            ></b-form-input>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editLastNameInputGroup" label="Last Name" label-for="editLastName">
            <b-form-input
              id="editLastName"
              name="editLastName"
              disabled
              size="sm"
              v-model="$userData('editLastName').bind"
            ></b-form-input>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editPostCodeInputGroup" label="Post Code" label-for="editPostCode">
            <b-form-input
              id="editPostCode"
              name="editPostCode"
              size="sm"
              v-model="$userData('editPostCode').bind"
              :state="validateState('editPostCode')"
              aria-describedby="editPostCodeFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
                id="editPostCodeFeedback"
            >Post Code must be between 6 and 8 characters long (including spaces)</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
      <div class="column col-3 col-lg-3">
        <div class="column col-3 col-lg-3" style="display: flex; align-items: flex-end; padding-bottom: 0;">
          <b-button @click="findAddress('edit')" size="sm" variant="success">Find Address</b-button>
        </div>
      </div>
    </div>
    <div class="row" v-if="$getUser('addressesFound')">
      <div class="column col-12 col-lg-12" style="padding-left: 8px; padding-right: 8px;">
        <v-select 
        @input="setAddress($event, 'edit')" 
        name="addressesFound" 
        id="addressesFound" 
        class="addressesFound" 
        :options="$getUser('addressesFound')"
        ></v-select>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editAddressInputGroup" label="Street Address" label-for="editAddress">
            <b-form-textarea
              id="editAddress"
              name="editAddress"
              size="sm"
              v-model="$userData('editAddress').bind"
              :state="validateState('editAddress')"
              aria-describedby="editAddressFeedback"
            ></b-form-textarea>
              <b-form-invalid-feedback
                id="editAddressFeedback"
              >This is a required field that must be at least 3 characters.</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editAddress2InputGroup" label="Address 2" label-for="editAddress2">
            <b-form-textarea
              id="editAddress2"
              name="editAddress2"
              size="sm"
              v-model="$userData('editAddress2').bind"
              :state="validateState('editAddress2')"
              aria-describedby="editAddress2Feedback"
            ></b-form-textarea>
            <b-form-invalid-feedback
                id="editAddress2Feedback"
              >Please enter a valid address.</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editCityInputGroup" label="City" label-for="editCity">
            <b-form-input
              id="editCity"
              name="editCity"
              size="sm"
              v-model="$userData('editCity').bind"
              :state="validateState('editCity')"
              aria-describedby="editCityFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
                id="editCityFeedback"
              >Please enter a valid city.</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editCountyInputGroup" label="County" label-for="editCounty">
            <b-form-input
              id="editCounty"
              name="editCounty"
              size="sm"
              v-model="$userData('editCounty').bind"
              :state="validateState('editCounty')"
              aria-describedby="editCountyFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
                id="editCountyFeedback"
            >Please enter a valid county.</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editCountryInputGroup" label="Country" label-for="editCountry">
            <b-form-input
              id="editCountry"
              name="editCountry"
              size="sm"
              v-model="$userData('editCountry').bind"
              :state="validateState('editCountry')"
              aria-describedby="editCountryFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
                id="editCountryFeedback"
            >Please enter a valid country.</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editSexInputGroup" label="Select Gender" label-for="editSex">
            <b-form-select
              id="editSex"         
              name="editSex"         
              size="sm"
              disabled
              v-model="$userData('editSex').bind"
              :options="['Female', 'Male', 'Other']"
            ></b-form-select>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editSalutationInputGroup" label="Salutation" label-for="editSalutation"> 
            <b-form-input
              id="editSalutation"
              name="editSalutation"
              size="sm"
              disabled
              v-model="$userData('editSalutation').bind"
            ></b-form-input>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editMobileInputGroup" label="Mobile" label-for="editMobile">
            <b-form-input
              id="editMobile"
              name="editMobile"
              size="sm"
              v-model="$userData('editMobile').bind"
              :state="validateState('editMobile')"
              aria-describedby="editMobileFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
                id="editMobileFeedback"
            >Mobile number must be 11 digits long and start with 07</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editEmailInputGroup" label="Email" label-for="editEmail">
            <b-form-input
              id="editEmail"
              name="editEmail"
              size="sm"
              v-model="$userData('editEmail').bind"
              :state="validateState('editEmail')"
              aria-describedby="editEmailFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
                id="editEmailFeedback"
            >Please enter a valid email.</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editHomeInputGroup" label="Home" label-for="editHome">
            <b-form-input
              id="editHome"
              name="editHome"
              size="sm"
              v-model="$userData('editHomePhone').bind"
              :state="validateState('editHome')"
              aria-describedby="editHomeFeedback"
            ></b-form-input>
            <b-form-invalid-feedback
                id="editHomeFeedback"
            >Home number must be 11 digits long and start with 01, 02, or 03</b-form-invalid-feedback>
          </b-form-group>
        </div>
      </div>
      <div class="column col-6 col-lg-6">
        <div>
          <b-form-group id="editDob" label="Date of Birth" label-for="editDob">
            <b-form-input
              id="editDob"
              name="editDob"
              disabled
              size="sm"
              v-model="$userData('editDOB').bind"
            ></b-form-input>
          </b-form-group>
        </div>
      </div>
    </div>
    <div class="row">
      <div class="column col-lg-3 col-sm-5 col-6">
        <b-button style="width: 100%; font-size: 0.6em;" type="submit" variant="primary">Edit</b-button>
      </div>
      <div class="column col-lg-3 col-sm-5 col-6">
        <b-button style="width: 100%; font-size: 0.6em;" class="ml-2" @click="$setUser('patientEdit', false); resetValues(); $set(globalModels, 'loadingPatients', true); $set(globalModels, 'patientSearchApplied', true);  $('#panel').scrollTop(0); $setUser('addressesFound', [])">Cancel</b-button>
      </div>
    </div>
  </b-form>
</div>

<!-- End of Edit Patient Form -->

<div
  v-if="!globalModels.patientsLoaded && !$getUser('bookingFinished') && !$getUser('loadingBooking') && !$getUser('patientEdit')"
  class="d-flex justify-content-center"
>
  <Loading />
</div>
<b-alert
  v-if="getPatients && getPatients.error && !$asyncComputed.getPatients.updating && !$getUser('bookingFinished') && !$getUser('patientEdit')"
  show
  variant="warning"
>
  <span>{{ getPatients.error }}</span>
  <a href="#" @click.prevent="$asyncComputed.getPatients.update; this.sessionStorage.getPatients = {}; $refreshAsync('getPatients') ">
    <span>Refresh</span>
    <icon name="refresh" />
  </a>
</b-alert>

<div class="row" 
v-if="$getUser('noPatientsFound')">
  <div class="column col-12 col-sm-12 col-lg-12">
    <b-alert show variant="warning">
      No patients found, please try different search parameters or create a new patient.

      <button 
        v-if="!$getUser('lastPatient')"
        @click=";showForm('create'); setDefaultCreateValues()"
        style="padding: 5px; font-size: 0.6em;"
        class="btn  btn-success">
        Create Patient
      </button>

    </b-alert>
  </div>
</div>

  <button 
    v-if="!globalModels.loadingPatients && !$getUser('showCreatePatient') && !$getUser('patientEdit') && !$getUser('bookingFinished')"
    @click=";showForm('create'); setDefaultCreateValues()"
    style="padding: 5px; font-size: 0.6em;"
    class="btn  btn-success">
    Create Patient
  </button>

<div 
  v-if="!globalModels.loadingPatients && !$getUser('showCreatePatient') && !$getUser('patientEdit') && !$getUser('bookingFinished')"

  v-for="(row, idx) in globalModels.patients"

 :key="idx" class="card m-2"
  

 >
  <div class="row rowItem">
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"><span>First Name</span></label>
        </div>
        <div class="formsElement col-md-8 col-8">
          <div label-position="left" class="controlElement">
            <span>{{ row.First_Name__c }}</span>
          </div>
        </div>
      </div>
    </div>
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"><span>Last Name</span></label>
        </div>
        <div class="formsElement col-md-8 col-8">
          <div label-position="left" class="controlElement">
            <span>{{ row.Last_Name__c }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Patient ID -->
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"><span>Patient ID</span></label>
        </div>
        <div class="formsElement col-md-8 col-8">
          <div label-position="left" class="controlElement">
            <span>{{ row.Patient_ID__c }}</span>
          </div>
        </div>
      </div>
    </div>
    <!-- NHS Number -->
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"><span>NHS Number</span></label>
        </div>
        <div class="formsElement col-md-8 col-8">
          <div label-position="left" class="controlElement">
            <span>{{ row.NHS_Number__c }}</span>
          </div>
        </div>
      </div>
    </div>

    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"><span>Address</span></label>
        </div>
        <div class="formsElement col-md-8 col-8">
          <div label-position="left" class="controlElement">
            <span
              >{{ row.addresses[0].Street__c }}<br />
              {{ row.addresses[0].City_Town__c }}<br />
              {{ row.addresses[0].Post_Code__c }}
            </span>
          </div>
        </div>
      </div>
    </div>
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"><span>Address 2</span></label>
        </div>
        <div class="formsElement col-md-8 col-8">
          <div label-position="left" class="controlElement">
            <span>{{row.addresses[0].addr2}}</span>
          </div>
        </div>
      </div>
    </div>
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"><span>Mobile</span></label>
        </div>
        <div class="formsElement col-md-8 col-8">
          <div
            label-position="left"
            class="controlElement"
            gridid="patientData"
          >
            {{ row.Mobile_Phone__c }}
          </div>
        </div>
      </div>
    </div>
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"><span>Email</span></label>
        </div>
        <div class="formsElement col-md-8 col-8">
          <div
            label-position="left"
            class="controlElement"
            gridid="patientData"
          >
            <span>{{ row.Email__c }}</span>
          </div>
        </div>
      </div>
    </div>
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"><span>Home</span></label>
        </div>
        <div class="formsElement col-md-8 col-8">
          <div
            label-position="left"
            class="controlElement"
            gridid="patientData"
          >
            <span>{{ row.Home_Phone__c }}</span>
          </div>
        </div>
      </div>
    </div>
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-6"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-nowrap forms-wrapper">
        <div class="col-md-4 formLabel">
          <label class="form-control-label"
            ><span>Date Of Birth</span></label
          >
        </div>
        <div class="formsElement col-md-8 col-8">
          <div
            class="ellipsis controlElement"
            label-position="left"
            gridid="patientData"
          >
            <span v-if="row.Date_of_Birth">
              {{row.Date_of_Birth.substring(6, 8)}}-{{row.Date_of_Birth.substring(4, 6)}}-{{ row.Date_of_Birth.substring(0, 4)}}
            </span>
          </div>
        </div>
      </div>
    </div>
    
    <div
      class="controlItem pl-0 pr-0 pr-md-4 mt-1 mt-md-0 col-md-12"
      gridid="patientData"
      rowdata="[object Object]"
    >
      <div class="row flex-wrap forms-wrapper"
      
       
       
       >
        <div class="formsElement col-md-10 col-120 col-sm-8">
          <div label-position="left" class="controlElement" v-if="$getUser('clinicid')">
            <div class="d-flex">
              <button
                type="button"
                class="btn m-1 btn-success btn-sm"
                style="min-height: 24px"
                @click="$setUser('loadingBooking', true); makeAppointment(row.Patient_ID__c, row)"
              >
                <span>Book Appointment</span>
              </button>
            </div>
          </div>
        </div>
        <div class="formsElement col-12 col-md-2 col-lg-2">
          <div label-position="right" class="controlElement">
            <div class="d-flex">
              <button
                type="button"
                class="btn m-1 btn-primary btn-sm"
                style="min-height: 24px"
                @click="editPatient(row);"
              >
                <span>Edit Patient</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

