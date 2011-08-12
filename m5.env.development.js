/*
       @@@@@@@@@@@@@>      @@@@@@@@@@>
       @>    @@@>  @>      @>         
       @>     @>   @>      @@@@@@@@@@>
       @>          @>               @>
       @>          @>               @>
       @>          @>      @@@@@@@@@>       

  Use this file to configure development-environment specific settings. The logical include "@require m5.env"
  will include m5.env.<environment>.js automatically.
  
*/
M5.assume_browser(true);
M5.settings.simulator_console = true;
$(function() {
  if (M5.remote) {
    M5.remote.connect_receive(M5.settings.app_name);
  }
});

M5.settings.app_name = 'cities'
M5.settings.app_name = 'cities'
